# Sailor Inventory (স্টক ভেরিফিকেশন স্ক্যানার)

## GitHub-এ চালু করার ধাপ (একবারই)
1. GitHub-এ নতুন repository খুলুন (যেমন `sailor-inventory`, Public)।
2. এই ফোল্ডারের **সব ফাইল** (`.github` ফোল্ডারসহ) আপলোড করুন।
3. Settings → Pages → Branch: `main` / root → Save।
4. লিংক হবে `https://mirpur2sailor-max.github.io/sailor-inventory/`। স্টাফ ফোনে খুলে "Add to Home screen" দেবে।
5. অ্যাপ পাসওয়ার্ড: আপনার দেওয়া পাসওয়ার্ড (কোডে শুধু হ্যাশ আছে)।

## স্টক রিপোর্ট আপডেট (২টি উপায়)
**A. অ্যাপের ভিতর থেকে (Settings → Stock data publisher)**
Repository নাম, branch, GitHub token ও নতুন `.xlsx` দিয়ে Publish করুন।
Token: GitHub → Settings → Developer settings → Fine-grained tokens → শুধু এই repo → Permissions: Contents = Read and write।

**B. সরাসরি GitHub-এ**
`data/source/` ফোল্ডারে নতুন `Stock_Report_DD.MM.YYYY.xlsx` আপলোড করুন। `.github/workflows/build-stock.yml` নিজে `data/stock.json` বানিয়ে দেবে।
(Actions → Workflow permissions → Read and write দিতে হতে পারে।)

দুই ক্ষেত্রেই স্টাফের ফোন অ্যাপ খুললে/ফোকাস করলে নিজে নতুন স্টক নিয়ে নেয়। চলমান স্ক্যান থাকলে সেটি শেষ/বাতিল হওয়ার পর প্রয়োগ হয়।

## স্ক্যানের নিয়ম
- Gender → Master Category → Category → Season → Size বেছে শুরু করুন; শুধু নির্বাচিত সেকশনের বারকোড গণনা হয়।
- অন্য সেকশনের বারকোড = "Other" (বাদ), স্টক রিপোর্টে নেই = "Wrong"।
- Finish → Missing দেখুন → দরকারে Continue scanning → Complete করলে Excel রিপোর্ট (Summary, Reconciliation, Short, Excess, Wrong Barcode, Out of Selection, Scan Log)।
- একই বারকোড ক্যামেরার সামনে ধরে রাখলে বারবার গণনা হয় না; পরের পিসে সরালে আবার গণনা হয়।

## ডাটা কনভার্টার লোকালি চালাতে
`pip install openpyxl && python tools/build_stock.py data/source/Stock_Report.xlsx`
