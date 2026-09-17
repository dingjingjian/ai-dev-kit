# -*- coding: utf-8 -*-
"""「素材第几秒」→ 帧号映射，以及素材越界体检。

素材是按「播放」处理的，不是定格：idx = round((srcFrom + (t - t0)) * SRCFPS)。
一旦 srcFrom + dur 越过素材长度，取不到帧会静默退到最后一帧 ——
画面看着正常，其实已经不动了。这个 bug 极其隐蔽，所以每次合成前必查。
"""
import pathlib, sys
from _tl import load

BASE = pathlib.Path(__file__).resolve().parent
CLIPS = BASE / "clips"
SRCFPS = 30


def frame_count(clip):
    d = CLIPS / clip
    if not d.exists():
        return 0
    return len(list(d.glob("f*.jpg")))


def frame_counts():
    tl = load()
    return {c["clip"]: frame_count(c["clip"]) for c in tl["CLIPS"]}


def plan(tl=None):
    """全片逐帧取帧计划：[(帧号, 素材名, 素材帧号)]"""
    tl = tl or load()
    fps = tl.get("FPS") or 30
    n_total = int(round(tl["DURATION"] * fps))
    counts = frame_counts()
    out = []
    for nf in range(n_total):
        t = nf / fps
        shot = None
        for c in tl["CLIPS"]:
            if t < c["t1"]:
                shot = c
                break
        if shot is None:
            shot = tl["CLIPS"][-1]
        idx = int(round((shot.get("srcFrom", 0) + (t - shot["t0"])) * SRCFPS))
        n = counts.get(shot["clip"], 0)
        if n:
            idx = max(0, min(idx, n - 1))
        out.append((nf, shot["clip"], idx))
    return out


def check_material():
    tl = load()
    counts = frame_counts()
    need = {}
    for _nf, clip, idx in plan(tl):
        need[clip] = max(need.get(clip, -1), idx)
    ok = True
    for clip in sorted(need):
        mx, have = need[clip], counts.get(clip, 0)
        good = mx < have
        ok = ok and good
        print("material %s %-12s need<=%4d  have=%4d" %
              ("OK  " if good else "OVER", clip, mx, have))
    return ok


if __name__ == "__main__":
    ok = check_material()
    print("MATERIAL", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)
