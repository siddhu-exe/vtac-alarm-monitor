import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from backend.app.main import create_app  # noqa: E402
from backend.app.settings import Settings  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    d = tmp_path_factory.mktemp("empty")  # no replay sample / model -> synthetic + mock
    app = create_app(Settings(model_mode="mock", model_dir=d, sample_dir=d, n_synthetic=4))
    return TestClient(app)


def test_health(client):
    h = client.get("/health").json()
    assert h["status"] == "ok" and h["model_mode"] == "mock" and h["n_alarms"] == 4
    assert h["synthetic_data"] is True and h["sim"] is True and "simulated" in h["label"]


def test_patients_and_alarms(client):
    pats = client.get("/patients").json()
    assert sum(len(p["alarm_ids"]) for p in pats) == 4
    al = client.get("/alarms").json()
    assert {a["ground_truth"] for a in al} == {"true", "false"}
    one = client.get("/alarms", params={"patient_id": al[0]["patient_id"]}).json()
    assert all(a["patient_id"] == al[0]["patient_id"] for a in one)
    d = client.get(f"/alarms/{al[2]['alarm_id']}").json()
    assert d["fs"] == 250 and d["quality"]["ABP"] == "absent"  # synthetic alarm 3 lacks ABP
    assert client.get("/alarms/nope").status_code == 404


def test_predict_by_alarm_is_deterministic_and_logs_latency(client):
    r1 = client.post("/predict", json={"alarm_id": "syn_0001"}).json()
    r2 = client.post("/predict", json={"alarm_id": "syn_0001"}).json()
    assert r1["p_true"] == r2["p_true"] and r1["model_mode"] == "mock"
    assert r1["verdict"] in ("TRUE_ALARM", "FALSE_ALARM")
    assert r1["action"] == ("escalated" if r1["verdict"] == "TRUE_ALARM" else "suppressed")
    assert r1["latency_ms"] > 0 and r1["mask"] == [1, 1, 1, 1]
    m = client.get("/metrics").json()
    assert m["count"] >= 2 and m["p95_ms"] is not None


def test_predict_raw_window_and_validation(client):
    import numpy as np

    from vtac.config import VtacConfig
    from vtac.synthetic import make_segment

    cfg = VtacConfig()
    seg = make_segment(cfg, True, 7)[:, : cfg.window_end_index]
    body = {
        "signals": [[None if np.isnan(v) else float(v) for v in row] for row in seg[:, -3000:]],
        "mask": [1, 1, 1, 0],
        "fs": 250,
    }
    r = client.post("/predict", json=body)
    assert r.status_code == 200 and r.json()["mask"] == [1, 1, 1, 0]
    assert client.post("/predict", json={**body, "fs": 100}).status_code == 422
    assert client.post("/predict", json={}).status_code == 422
    assert (
        client.post("/predict", json={"alarm_id": "x", "signals": [[1.0]], "fs": 250}).status_code
        == 422
    )
    assert client.post("/predict", json={"alarm_id": "nope"}).status_code == 404


def test_websocket_replay_emits_session_chunks_verdict_end(client):
    with client.websocket_connect("/ws/replay/syn_0001?speed=20&start_s=298&end_s=304") as ws:
        msgs = []
        while True:
            m = ws.receive_json()
            msgs.append(m)
            if m["type"] in ("end", "error"):
                break
    types = [m["type"] for m in msgs]
    assert types[0] == "session" and types[-1] == "end" and types.count("verdict") == 1
    s, v = msgs[0], next(m for m in msgs if m["type"] == "verdict")
    assert (
        s["sim"] is True
        and "simulated" in s["label"]
        and s["channels"] == ["ECG_1", "ECG_2", "PPG", "ABP"]
    )
    chunks = [m for m in msgs if m["type"] == "chunk"]
    assert len(chunks) == 24 and len(chunks[0]["channels"]["ECG_1"]) == 64
    assert v["t"] == 302.0 and v["ground_truth"] == "true" and v["latency_ms"] > 0
    # verdict arrives right after the chunk that contains the window end (t = 302.0 s), not before
    i = types.index("verdict")
    assert msgs[i - 1]["type"] == "chunk" and msgs[i - 1]["t0"] <= 302.0 < msgs[i - 1]["t0"] + 0.256


def test_websocket_errors(client):
    with client.websocket_connect("/ws/replay/missing") as ws:
        assert ws.receive_json()["code"] == "not_found"
    with client.websocket_connect("/ws/replay/syn_0001?speed=0") as ws:
        assert ws.receive_json()["code"] == "bad_params"


def test_onnx_mode_without_model_is_503(tmp_path):
    app = create_app(
        Settings(model_mode="onnx", model_dir=tmp_path, sample_dir=tmp_path, n_synthetic=1)
    )
    c = TestClient(app)
    assert c.get("/health").json()["status"] == "degraded"
    assert c.post("/predict", json={"alarm_id": "syn_0001"}).status_code == 503


def test_onnx_predictor_end_to_end(tmp_path):
    np = pytest.importorskip("numpy")
    onnx = pytest.importorskip("onnx")
    pytest.importorskip("onnxruntime")
    from onnx import TensorProto, helper, numpy_helper

    from vtac.config import VtacConfig

    cfg = VtacConfig(model_version="tiny-test", threshold=0.5)
    w1 = numpy_helper.from_array(np.array([[0.5], [0.0], [0.0], [0.0]], dtype=np.float32), "w1")
    w2 = numpy_helper.from_array(np.array([[1.0], [1.0], [1.0], [1.0]], dtype=np.float32), "w2")
    nodes = [
        helper.make_node("ReduceMean", ["signals"], ["m"], axes=[2], keepdims=0),
        helper.make_node("MatMul", ["m", "w1"], ["a"]),
        helper.make_node("MatMul", ["mask", "w2"], ["b"]),
        helper.make_node("Add", ["a", "b"], ["logit"]),
    ]
    graph = helper.make_graph(
        nodes,
        "tiny",
        [
            helper.make_tensor_value_info(
                "signals", TensorProto.FLOAT, ["N", 4, cfg.window_samples]
            ),
            helper.make_tensor_value_info("mask", TensorProto.FLOAT, ["N", 4]),
        ],
        [helper.make_tensor_value_info("logit", TensorProto.FLOAT, ["N", 1])],
        [w1, w2],
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
    model.ir_version = 8
    model_dir = tmp_path / "models"
    model_dir.mkdir()
    onnx.save(model, str(model_dir / "model.onnx"))
    cfg.save(model_dir / "model_config.json")

    app = create_app(
        Settings(model_mode="onnx", model_dir=model_dir, sample_dir=tmp_path, n_synthetic=2)
    )
    c = TestClient(app)
    h = c.get("/health").json()
    assert h["status"] == "ok" and h["model_mode"] == "onnx" and h["model_version"] == "tiny-test"
    r = c.post("/predict", json={"alarm_id": "syn_0001"}).json()
    # logit = 0.5 * mean(ECG_1 window) + sum(mask); z-scored window => mean ~0, logit ~ 4
    assert r["model_mode"] == "onnx" and r["p_true"] == pytest.approx(
        1 / (1 + np.exp(-4.0)), abs=1e-3
    )
    assert r["verdict"] == "TRUE_ALARM" and r["action"] == "escalated"
