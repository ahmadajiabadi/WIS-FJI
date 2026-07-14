# QC Scanner Pro - Agent Guidelines

## 🚫 Blocked Files (Jangan Pernah Dibaca)
backend/node_modules/, backend/uploads/, backend/scratch/, data/, qcc_assets/, *.pptx, backend/package-lock.json

## 🎯 Task → File Mapping
| Task | File yang Harus Dibaca |
|------|------------------------|
| CRUD records / save / edit record | `backend/routes/records.js`, `backend/config/db.js` |
| AI Scan / Draft queue / upload batch | `backend/routes/drafts.js`, `backend/utils/ai.js`, `backend/workers/queue.js` |
| Dashboard / Analytics / Chart | `backend/routes/dashboard.js`, `backend/routes/records.js` |
| Input Manual CS / Modal checksheet | `frontend/js/tabs/ManualInputModal.js` (export `ManualInputSection`), `backend/routes/records.js` |
| Part Master data / check points | `backend/routes/master.js`, `backend/config/db.js` |
| AI Chat / Report Analisis | `backend/routes/ai.js` |
| Frontend UI / Tab apapun | `frontend/index.html`, `frontend/js/app.js`, `frontend/js/tabs/[nama_tab].js` |
| Image upload / crop | `backend/middlewares/upload.js`, `frontend/js/PerspectiveCropper.js` |
| Database schema / migration | `backend/config/db.js` |
| Server entry / middleware | `backend/server.js` |
| Settings / Voice Guide CRUD | `backend/routes/settings.js`, `frontend/js/tabs/SettingsTab.js` |
| Voice quantity commands (OK/NG/Scrap/Undo) | `backend/routes/settings.js`, `frontend/js/tabs/SettingsTab.js`, `frontend/js/components.js` |
| PPIC plan CRUD | `backend/routes/ppic.js`, `backend/config/db.js`, `frontend/js/tabs/PpicTab.js` |
| Voice QC setup (select LH/RH part from PPIC) | `frontend/js/VoiceSetup.js`, `frontend/js/tabs/VoiceTab.js` |
| Voice inspection session management | `frontend/js/tabs/VoiceTab.js`, `frontend/js/VoiceSetup.js` |

## 🏗️ System Architecture
- **Backend:** Express.js + MySQL (`backend/server.js`)
- **Frontend:** React via CDN + Babel (`frontend/index.html` + `frontend/js/app.js`)
- **AI:** Google Gemini API (`backend/utils/ai.js`)

## ⚡ Key Behaviors
- **Efficiency timer auto-start on first counter click** — `forceRecordEfficiency` starts timer if not running, then records the item
- **Live monitoring includes efficiency** — `sendLiveUpdateNow()` sends `efficiency`, `totalCheckTime`, `totalChecks`
- **Dashboard efficiency chart** — `/dashboard/advanced` returns `efficiencyTrend` (monthly avg), rendered via `renderCharts()` in `DashboardTab.js`
- **Date input field** — Tanggal field in VoiceTab metadata form, defaults to today, sent to backend as `meta.date`
- **Efficiency persist across tabs** — `efficiencyItems` dan `currentTaktTime` disimpan ke `sessionStorage`, pulih saat komponen remount
- **Timer: hanya START & PAUSE** — Tombol STOP dihapus; START selalu visible, PAUSE hanya saat timer running
- **PPIC plan without shift** — `ppic_plans` unique key `(tanggal, part_number)`, shift tidak termasuk
- **Voice QC setup** — `VoiceSetup` component muncul pertama kali jika tidak ada `qc_voice_active_session` di localStorage
- **Ganti Part** — tombol merah di VoiceTab yang hapus `qc_voice_active_session` dari localStorage dan set `showSetup = true`
- **PPIC save dedup** — `PpicTab.js` deduplikasi part_number saat save (karena `part_master` composite PK)
- **VoiceSetup session** — session skrg include `inspector`, `shift`, `tanggal`, `lhPart`, `rhPart`. Shift dropdown 1/2/3. Part selection pake tabel (Part Name, Part Number, Line) dengan font jelas. RH part fix dengan state terpisah per komponen tabel.

## 📜 Riwayat Perbaikan
<!-- Tambah entri baru di PALING ATAS -->
- **[2026-06-24]** VoiceSetup: tambah field inspector + shift dropdown (1/2/3). Part selection ganti ke tabel (Part Name, Part Number, Line) dengan font jelas. RH part fix dengan state terpisah per komponen tabel (expandedLh/expandedRh). Session skrg include inspector & shift. LinePos auto-fill di metadata.
- **[2026-06-24]** VoiceSetup: PartTable jadi React component (bukan helper function) — tiap side punya instance komponen independen, fix total RH tidak bisa diklik.
- **[2026-06-24]** VoiceSetup: renderTable jadi pure function dgn parameter eksplisit (tidak pakai closure ke komponen) — fix RH tdk bisa diklik. onSelect callback terpisah per tabel.
- **[2026-06-24]** PPIC: hapus shift dari planing, unique key `(tanggal, part_number)`. VoiceSetup: hapus shift dropdown. PpicTab.js: dedup part_number saat save. Tombol "Ganti Part" di VoiceTab untuk kembali ke setup. 
