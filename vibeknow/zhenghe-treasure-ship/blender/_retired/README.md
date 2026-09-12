# 归档（v1 遗留）

按参考图重建（2026-09-12）后作废的脚本与产物。**不再参与任何流程**，保留仅供回溯。

| 文件 | 作废原因 |
|------|----------|
| `audit_geometry.py` | 独立审计脚本，已被 `headless_check.py` 吸收（现为 19 项，覆盖其全部断言并新增舷孔、双色船体、拆解分组覆盖、型深比例、帆高宽比等）。且它调用的是 v1 的 `BS.Z_DECK` / `BS.hull_half_width_at`，重建后这两个符号已改名为 `deck_z(t)` / `half_width(t)`，直接跑会 AttributeError。 |
| `_audit.txt` | 上者产出的 v1 审计报告（11 项）。现役报告见 `../out/_log.txt`。 |

另：v1 的四个渲染图（`preview_*_broadside/bow/stern/top.png`）已移入 `../out/_v1_preview/`。
现役渲染图为 `../out/preview_01_ref` ~ `preview_05_top`，口径见 `../render_preview.py` 文件头。
