# מה אומר התקנון? (אתר ציבורי)

הבוט של אגודת הסטודנטים לשאלות על תקנוני האוניברסיטה העברית, כאתר רגיל.

- `public/`: האתר (index.html, packs/, test.html להשוואת מודלים).
- `functions/api/chat.js`: הפונקציה שמחזיקה את המפתח של אופן־ראוטר ופונה למודל. המפתח לא נמצא בקוד. הוא נשמר בהגדרות של הפרויקט בקלאודפלייר.

הגדרות בקלאודפלייר פייג׳ס (Cloudflare Pages): בלי פקודת בנייה (Build command), ותיקיית הפלט (Build output directory) היא `public`. משתני סביבה: `OPENROUTER_KEY` (סוד), `MODEL`, `MODEL_QUICK`, `PER_HOUR`, `TEST_MODELS`.
