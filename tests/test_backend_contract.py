import asyncio

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from backend.app.control import ReplayControl  # noqa: E402
from backend.app.main import create_app  # noqa: E402
from backend.app.settings import Settings  # noqa: E402
from backend.app.ws_schemas import (  # noqa: E402
    Attribution,
    ChunkMsg,
    ControlIn,
    Numerics,
    VerdictMsg,
)
from fastapi.testclient import TestClient  # noqa: E402
from pydantic import ValidationError  # noqa: E402

REPLAY = "/ws/replay/syn_0001?speed=20&start_s=290&end_s=304"


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    d = tmp_path_factory.mktemp("empty")
    return TestClient(
        create_app(Settings(model_mode="mock", model_dir=d, sample_dir=d, n_synthetic=4))
    )


def _collect(ws) -> list[dict]:
    msgs = []
    while True:
        m = ws.receive_json()
        msgs.append(m)
        if m["type"] in ("end", "error") and m.get("code") != "bad_control":
            return msgs


# --- GET /model ---------------------------------------------------------------------------
def test_model_endpoint_exposes_config_not_hardcoded(client):
    m = client.get("/model").json()
    assert m["model_mode"] == "mock" and m["model_version"] == "mock-0"
    assert m["channel_slots"] == ["ECG_1", "ECG_2", "PPG", "ABP"]
    assert m["window_s"] == 10.0 and m["window_end_offset_s"] == 2.0 and m["alarm_onset_s"] == 300.0
    assert m["threshold"] == pytest.approx(0.5) and m["tpr_target"] == 0.95
    assert m["segment_s"] == 360.0 and m["max_speed"] == 20.0 and 0 < m["chunk_s"] < 1
    assert m["metrics"] == {"test_pr_auc": None, "challenge_score": None}
    assert m["architecture"] is None and "mock" in m["runtime"] and m["sim"] is True


def test_model_endpoint_in_degraded_onnx_mode(tmp_path):
    c = TestClient(create_app(Settings(model_mode="onnx", model_dir=tmp_path, sample_dir=tmp_path)))
    m = c.get("/model").json()
    assert m["model_version"] is None and m["runtime"] == "unavailable"


# --- WebSocket: numerics and optional attribution -------------------------------------------
def test_chunks_carry_numerics_about_once_per_second(client):
    with client.websocket_connect(REPLAY) as ws:
        msgs = _collect(ws)
    chunks = [m for m in msgs if m["type"] == "chunk"]
    with_num = [c for c in chunks if "numerics" in c]
    assert "numerics" in chunks[0]  # first chunk after connect already has readouts
    assert 12 <= len(with_num) <= 16 and len(chunks) > 3 * len(with_num)  # 14 s replayed
    n = chunks[0]["numerics"]
    assert set(n) == {"hr_bpm", "pr_bpm", "abp_sys", "abp_dia", "abp_map"}
    ChunkMsg.model_validate({k: v for k, v in with_num[0].items() if k != "type"})
    assert with_num[0]["numerics"]["pr_bpm"] is not None  # synthetic alarm 1 has a clean PPG


def test_verdict_omits_attribution_until_populated(client):
    with client.websocket_connect(REPLAY) as ws:
        v = next(m for m in _collect(ws) if m["type"] == "verdict")
    assert "attribution" not in v
    VerdictMsg.model_validate({k: x for k, x in v.items() if k != "type"})


def test_attribution_schema_validation():
    ok = Attribution(
        method="gradcam",
        per_channel={"ECG_1": [0.1, 0.9], "PPG": [0.4, 0.6]},
        channel_share={"ECG_1": 0.7, "PPG": 0.3},
    )
    assert ok.per_channel["PPG"] == [0.4, 0.6]
    with pytest.raises(ValidationError):  # ragged bins
        Attribution(method="g", per_channel={"a": [0.1], "b": [0.1, 0.2]}, channel_share={})
    with pytest.raises(ValidationError):  # out of range
        Attribution(method="g", per_channel={"a": [1.5]}, channel_share={})
    base = {
        "alarm_id": "a", "t": 1.0, "p_true": 0.2, "verdict": "FALSE_ALARM", "action": "suppressed",
        "threshold": 0.5, "latency_ms": 1.0, "quality": {"ECG_1": "good"}, "mask": [1],
        "ground_truth": "false", "model_mode": "mock", "model_version": "m",
    }  # fmt: skip
    msg = VerdictMsg(**base, attribution=ok)
    assert msg.wire()["attribution"]["channel_share"] == {"ECG_1": 0.7, "PPG": 0.3}


def test_numerics_none_values_stay_null_on_the_wire():
    wire = ChunkMsg(
        t0=0.0,
        channels={},
        quality={},
        numerics=Numerics(hr_bpm=None, pr_bpm=70.0, abp_sys=None, abp_dia=None, abp_map=None),
    ).wire()
    assert wire["numerics"]["hr_bpm"] is None and wire["numerics"]["pr_bpm"] == 70.0


# --- WebSocket control ---------------------------------------------------------------------
def test_pause_resume_and_speed_are_acknowledged(client):
    with client.websocket_connect("/ws/replay/syn_0001?speed=10&start_s=298&end_s=304") as ws:
        ws.send_json({"type": "control", "action": "pause"})
        ws.send_json({"type": "control", "action": "speed", "speed": 8})
        ws.send_json({"type": "control", "action": "resume"})
        msgs = _collect(ws)
    states = [(m["playing"], m["speed"]) for m in msgs if m["type"] == "state"]
    assert states == [(False, 10.0), (False, 8.0), (True, 8.0)]
    assert msgs[-1]["type"] == "end" and sum(m["type"] == "verdict" for m in msgs) == 1


def test_bad_control_is_reported_without_closing(client):
    with client.websocket_connect("/ws/replay/syn_0001?speed=20&start_s=298&end_s=304") as ws:
        ws.send_json({"type": "control", "action": "speed", "speed": 999})
        ws.send_text("not json")
        ws.send_json({"type": "control", "action": "fly"})
        msgs = _collect(ws)
    errors = [m for m in msgs if m["type"] == "error"]
    assert [e["code"] for e in errors] == ["bad_control"] * 3
    assert msgs[-1]["type"] == "end"  # the replay carried on and finished


def test_control_message_validation():
    assert ControlIn(type="control", action="speed", speed=2).speed == 2
    for bad in (
        dict(action="speed"),
        dict(action="speed", speed=0),
        dict(action="speed", speed=21),
        dict(action="pause", speed=1),
    ):
        with pytest.raises(ValidationError):
            ControlIn(type="control", **bad)


# --- pacing state machine ------------------------------------------------------------------
def test_pace_blocks_while_paused_and_resumes():
    async def run():
        ctl = ReplayControl(speed=50)
        await asyncio.wait_for(ctl.pace(0.05), 0.5)  # 1 ms of wall time at 50x
        ctl.pause()
        assert not ctl.playing
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(ctl.pace(0.05), 0.05)
        ctl.resume()
        await asyncio.wait_for(ctl.pace(0.05), 0.5)

    asyncio.run(run())


def test_speed_changes_pace_and_no_catch_up_burst_after_pause():
    async def run():
        loop = asyncio.get_running_loop()
        ctl = ReplayControl(speed=1)
        ctl.set_speed(100)
        t0 = loop.time()
        for _ in range(5):
            await ctl.pace(0.2)  # 5 x 0.2 s simulated = 1 s -> 10 ms at 100x
        assert loop.time() - t0 < 0.3
        ctl.pause()
        await asyncio.sleep(0.2)  # paused for a while: the schedule must not build up a debt
        ctl.resume()
        t1 = loop.time()
        await ctl.pace(1.0)  # 1 s simulated at 100x = 10 ms, measured from "now"
        assert 0.005 < loop.time() - t1 < 0.2

    asyncio.run(run())
