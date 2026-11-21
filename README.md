# Sailor Inventory v2  (Daily-Inventory)

লাইভ লিংক: https://mirpur2sailor-max.github.io/Daily-Inventory/

## v2-এ নতুন কী (আগের ৩টি অ্যাপ থেকে)
- **এনক্রিপ্টেড স্টক ডাটা** (`data/stock.dat`): Refill Monitor / Planner-এর মতো access code দিয়ে লক। পাবলিক GitHub-এও স্টক ডাটা পড়া যায় না। অ্যাপের পাসওয়ার্ডই access code।
- **উন্নত স্ক্যানার** (Planner-এর পদ্ধতি): দ্রুত রিডার + HD রিডার, ঝাপসা ক্যামেরার জন্য শার্পেন পাস, ১080p, কন্টিনিউয়াস ফোকাস, 💡 ফ্ল্যাশ, 1×/1.5×/2×/3× জুম, ⟳ ক্যামেরা বদল (মনে রাখে), 📷 **ছবি থেকে স্ক্যান**।
- **সাম্প্রতিক সেকশন**: Home ও Scan পেজে, ১ ট্যাপে একই সেকশন আবার শুরু (শেষ accuracy সহ)।
- **তালিকা কপি**: Missing / Excess / Wrong তালিকা টেক্সট হিসেবে কপি করে WhatsApp-এ দেওয়া যায়।
- **সাইজ স্ট্রিপ**: স্ক্যান করা স্টাইল-কালারের সব সাইজের কাউন্ট/সিস্টেম পিস একসাথে; স্টাইল কোড কপি বাটন।
- **পাবলিশার**: এনক্রিপ্ট করে GitHub-এ পাবলিশ, পুরোনো `stock.json`/`meta.json` নিজে মুছে ফেলে, `stock.dat` ডাউনলোড (নিজে আপলোডের জন্য), অথবা "শুধু এই ফোনে ব্যবহার"।
- অ্যাপ ইনস্টল বাটন, কস্ট প্রাইস (CPU) আর ডাটায় থাকে না।

## আপডেট করার ধাপ (আগের রিপোতেই)
1. GitHub → `Daily-Inventory` → **Add file → Upload files** → এই ZIP-এর **সব ফাইল ও ফোল্ডার** (index.html, sw.js, manifest.webmanifest, js, css, icons, data, tools, README.md) দিন → **Commit changes**। একই নামের ফাইল নিজে বদলে যাবে।
2. **data ফোল্ডারে পুরোনো `stock.json` ও `meta.json` মুছে দিন** (ফাইল খুলে ডান পাশের ⋯ → Delete file)। এগুলোতে কস্ট প্রাইস ছিল।
   অথবা ধাপ ৩ করলে পাবলিশার নিজেই মুছে দেবে।
3. অ্যাপ খুলে Settings → Stock data publisher → সর্বশেষ Stock Report দিয়ে **Publish to GitHub** (token লাগবে, নিচে দেখুন)।
4. স্টাফদের ফোনে অ্যাপ খুললেই নতুন ভার্সন ও নতুন স্টক পেয়ে যাবে। চলমান স্ক্যান ও পুরোনো রিপোর্ট নষ্ট হয় না।

> ZIP-এর `data/stock.dat` দেওয়া আছে ২০.১১.২০২৬ রিপোর্ট থেকে (শুধু নতুন ফোনের জন্য)। আপনার ফোনে আরও নতুন স্টক থাকলে সেটাই থাকবে।

## GitHub token (একবার)
GitHub → Settings → Developer settings → Fine-grained tokens → শুধু `Daily-Inventory` রিপো → Permissions: **Contents = Read and write**। অ্যাপে পাবলিশারে বসান ("Remember token" দিলে ফোনে মনে রাখে)।

## বিকল্প: সরাসরি GitHub-এ আপডেট
- `data/source/` ফোল্ডারে নতুন `.xlsx` আপলোড করলে `.github/workflows/build-stock.yml` নিজে `stock.dat` বানাবে। একবার Secret সেট করতে হবে: নাম `STOCK_CODE`, মান = অ্যাপের পাসওয়ার্ড। (Actions → Workflow permissions → Read and write)
- অথবা পাবলিশারে **Download stock.dat** → GitHub `data` ফোল্ডারে আপলোড।

## কোড বদলালে
অ্যাক্সেস কোড/পাসওয়ার্ড বদলাতে `js/app.js`-এর `PW_HASH` ও পাবলিশারের কোড একসাথে বদলাতে হয়। বদলাতে চাইলে আমাকে বলুন।

## স্ক্যানের নিয়ম
- Gender → Master Category → Category → Season → Size বেছে শুরু। শুধু নির্বাচিত সেকশনের বারকোড গণনা হয়; অন্য সেকশনের = "Other", স্টকে নেই = "Wrong"।
- Finish → Missing দেখুন → দরকারে Continue scanning → Complete = Excel (Summary, Reconciliation, Short, Excess, Wrong Barcode, Out of Selection, Scan Log)।
- একই বারকোড ধরে রাখলে বারবার গণনা হয় না; পরের পিসে সরালে আবার গণনা হয়।
- স্ক্যান না হলে: দূরত্ব ১০–২০ সেমি, 💡 ফ্ল্যাশ, জুম, ⟳ ক্যামেরা বদল, বা 📷 ছবি থেকে স্ক্যান।
