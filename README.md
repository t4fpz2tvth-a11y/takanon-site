# מה אומר התקנון? (אתר ציבורי)

הבוט של אגודת הסטודנטים לשאלות על תקנוני האוניברסיטה העברית, כאתר רגיל.

- `public/`: האתר (index.html, packs/, test.html להשוואת מודלים).
- `public/coord/`: גרסת הרכזים. הכניסה אליה היא עם קוד גישה אישי שרמ"ח יוצר.
- `functions/api/db.js`, `functions/api/codes.js`, `functions/_lib.js`: היומן של הרכזים (מסד D1 בשם הקישור DB) וקודי הגישה.
- `functions/api/chat.js`: הפונקציה שמחזיקה את המפתח של אופן־ראוטר ופונה למודל. המפתח לא נמצא בקוד. הוא נשמר בהגדרות של הפרויקט בקלאודפלייר.

הגדרות בקלאודפלייר פייג׳ס (Cloudflare Pages): בלי פקודת בנייה (Build command), ותיקיית הפלט (Build output directory) היא `public`. משתני סביבה: `OPENROUTER_KEY` (סוד), `ADMIN_CODE` (סוד: קוד הכניסה של רמ"ח), `MODEL`, `MODEL_QUICK`, `PER_HOUR`, `TEST_MODELS`.

קישור (Binding) בקלאודפלייר: מסד D1 בשם הקישור `DB`.
