# دفتر السواق

تطبيق بسيط لسائق توصيل: يسجل المداخيل والمصاريف والمدخرات والديون ويحسب الربح الصافي. يخدم كموقع في المتصفح (كمبيوتر وتليفون) وكتطبيق أندرويد، والبيانات تتزامن بين كل الأجهزة.

## الملفات

- `www/` التطبيق نفسو (صفحة واحدة).
- `www/firebase-config.js` إعدادات Firebase (فارغة في البداية).
- `firestore.rules` قواعد الأمان: كل مستخدم يقرا ويكتب بياناتو هو برك.
- `.github/workflows/pages.yml` ينشر الموقع على GitHub Pages.
- `.github/workflows/android.yml` يبني ملف APK ويحطو في Releases.

## 1. تفعيل المزامنة (Firebase، مجاني)

بدون هذي الخطوة التطبيق يخدم، لكن البيانات تبقى في الجهاز الواحد.

1. ادخل على https://console.firebase.google.com وأنشئ مشروع جديد.
2. **Build > Authentication > Get started**، فعّل **Email/Password**.
3. **Build > Firestore Database > Create database**، اختار أقرب منطقة (مثلا `eur3`)، وابدأ في وضع الإنتاج.
4. في تبويب **Rules** الصق محتوى `firestore.rules` واضغط Publish.
5. **Project settings > Your apps > Web (`</>`)**، سجل تطبيق وانسخ `firebaseConfig`.
6. الصق القيم في `www/firebase-config.js` وارفع التعديل على GitHub.

القيم هذي مش أسرار. الأمان يجي من القواعد في الخطوة 4.

بعدها افتح التطبيق، اكتب إيميل وكلمة سر واضغط "حساب جديد". نفس الإيميل في التليفون والكمبيوتر يعطي نفس البيانات. التسجيلات تتحفظ في الجهاز حتى بدون نت وتتزامن كي يرجع.

## 2. نسخة المتصفح (GitHub Pages)

1. في المستودع: **Settings > Pages > Source: GitHub Actions**.
2. كل push على `main` ينشر الموقع، والرابط يظهر في تبويب **Actions**.
3. في Firebase: **Authentication > Settings > Authorized domains**، زيد `اسمك.github.io`.
4. على التليفون افتح الرابط في Chrome واضغط "إضافة إلى الشاشة الرئيسية".

## 3. تطبيق أندرويد

كل push على `main` يشغّل workflow **Build Android APK**:

1. حمّل `dafter-sawaq.apk` من **Releases > آخر نسخة أندرويد**.
2. على التليفون ثبّتو (لازم تسمح بالتثبيت من مصادر غير معروفة).

هذا APK للتجربة (debug) وما يصلحش للنشر في Google Play. للنشر في المتجر لازم توقيع (signing key).

## تشغيل محلي

```bash
npm install
npm run build:firebase   # يعيد بناء www/vendor/firebase.js
npx serve www            # أو أي سيرفر ثابت
```
