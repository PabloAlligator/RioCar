import express from 'express';
import nodemailer from 'nodemailer';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

const requiredEnv = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'TO_EMAIL'];

for (const key of requiredEnv) {
    if (!process.env[key]) {
        console.error(`Missing required env variable: ${key}`);
        process.exit(1);
    }
}

app.set('trust proxy', 1);

app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
        hidePoweredBy: true,
    })
);

app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

app.use(express.static(__dirname));

const sendLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 2,
    message: {
        success: false,
        message: 'Слишком много заявок. Попробуйте чуть позже.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

function cleanText(value, maxLength = 500) {
    return String(value || '')
        .replace(/[<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function normalizePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');

    if (digits.length === 11 && digits.startsWith('8')) {
        return digits;
    }

    if (digits.length === 11 && digits.startsWith('7')) {
        return `8${digits.slice(1)}`;
    }

    if (digits.length === 10) {
        return `8${digits}`;
    }

    return '';
}

function isValidPhone(phone) {
    return /^89\d{9}$/.test(normalizePhone(phone));
}

function formatPhone(phone) {
    const normalized = normalizePhone(phone);

    if (!normalized) return '';

    return `+7 (${normalized.slice(1, 4)}) ${normalized.slice(4, 7)}-${normalized.slice(7, 9)}-${normalized.slice(9, 11)}`;
}

function makeTelLink(phone) {
    const normalized = normalizePhone(phone);

    if (!normalized) return '';

    return `+7${normalized.slice(1)}`;
}

function buildEmailTemplate({
    name,
    formattedPhone,
    telLink,
    car,
    car_year,
    car_price,
    date,
    message,
    page
}) {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Новая заявка RioCar</title>
</head>

<body style="margin:0; padding:0; background:#090909; font-family:Arial, sans-serif; color:#ffffff;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#090909; padding:32px 12px;">
<tr>
<td align="center">

<table width="100%" cellpadding="0" cellspacing="0" style="
  max-width:640px;
  background:#111;
  border:1px solid rgba(255,255,255,0.06);
  border-radius:20px;
  overflow:hidden;
">

<!-- HEADER -->
<tr>
<td style="
  padding:32px;
  background:linear-gradient(135deg,#151515 0%,#090909 100%);
  border-bottom:3px solid #d8a016;
">

<div style="
  font-size:12px;
  letter-spacing:3px;
  text-transform:uppercase;
  color:#d8a016;
  margin-bottom:10px;
">
RIOCAR / ЗАЯВКА
</div>

<h1 style="
  margin:0;
  font-size:28px;
  line-height:1.2;
  text-transform:uppercase;
">
Новая заявка<br>
<span style="color:#d8a016;">с сайта</span>
</h1>

<p style="
  margin:14px 0 0;
  color:#9a9a9a;
  font-size:14px;
  line-height:1.6;
">
Клиент оставил заявку на аренду автомобиля.
</p>

</td>
</tr>

<!-- CONTENT -->
<tr>
<td style="padding:28px 32px;">

<table width="100%" cellpadding="0" cellspacing="0">

<tr>
<td style="padding:12px 0; color:#777; font-size:12px;">Имя</td>
</tr>
<tr>
<td style="padding:4px 0 16px; font-size:20px; font-weight:700;">
${name}
</td>
</tr>

<tr>
<td style="padding:12px 0; color:#777; font-size:12px;">Телефон</td>
</tr>
<tr>
<td style="padding:4px 0 16px; font-size:20px; font-weight:700;">
<a href="tel:${telLink}" style="color:#d8a016; text-decoration:none;">
${formattedPhone}
</a>
</td>
</tr>

<tr>
<td style="padding:12px 0; color:#777; font-size:12px;">Автомобиль</td>
</tr>
<tr>
<td style="padding:4px 0 16px;">
<span style="
  display:inline-block;
  padding:10px 16px;
  border-radius:999px;
  background:#d8a016;
  color:#000;
  font-weight:700;
">
${car || '-'}
</span>
</td>
</tr>

<tr>
<td style="padding:12px 0; color:#777; font-size:12px;">Год</td>
</tr>
<tr>
<td style="padding:4px 0 16px;">
${car_year || '-'}
</td>
</tr>

<tr>
<td style="padding:12px 0; color:#777; font-size:12px;">Цена</td>
</tr>
<tr>
<td style="padding:4px 0 16px;">
${car_price || '-'}
</td>
</tr>

<tr>
<td style="padding:12px 0; color:#777; font-size:12px;">Дата поездки</td>
</tr>
<tr>
<td style="padding:4px 0 16px;">
${date || '-'}
</td>
</tr>

<tr>
<td style="padding:12px 0; color:#777; font-size:12px;">Комментарий</td>
</tr>
<tr>
<td style="padding:4px 0 16px; color:#cfcfcf; line-height:1.6;">
${message || '—'}
</td>
</tr>

<tr>
<td style="padding:12px 0; color:#777; font-size:12px;">Страница</td>
</tr>
<tr>
<td style="padding:4px 0;">
${page || '-'}
</td>
</tr>

</table>

</td>
</tr>

<!-- FOOTER -->
<tr>
<td style="
  padding:24px 32px;
  background:#0b0b0b;
  border-top:1px solid rgba(255,255,255,0.06);
">

<a href="tel:${telLink}" style="
  display:inline-block;
  padding:14px 22px;
  background:linear-gradient(135deg,#e6b84d 0%,#d8a016 100%);
  color:#000;
  text-decoration:none;
  border-radius:10px;
  font-weight:700;
  text-transform:uppercase;
">
Позвонить клиенту
</a>

<p style="
  margin-top:16px;
  color:#666;
  font-size:12px;
">
Письмо автоматически отправлено с сайта RioCar.
</p>

</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`;
}

const MIN_FORM_TIME_MS = 2500;

app.post('/send', sendLimiter, async (req, res) => {
    try {

        console.log('IP:', req.ip);

         if (!req.body || typeof req.body !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'Некорректный запрос',
            });
        }

        if (req.body.website) {
            return res.status(400).json({
                success: false,
                message: 'Некорректная заявка',
            });
        }

        const formTime = Number(req.body.form_time || 0);

        if (!formTime || Date.now() - formTime < MIN_FORM_TIME_MS) {
            return res.status(400).json({
                success: false,
                message: 'Слишком быстрая отправка формы',
            });
        }

        const name = cleanText(req.body.name, 60);
        const phone = cleanText(req.body.phone, 40);
        const car = cleanText(req.body.car, 120);
        const tripDate = cleanText(req.body.date, 100);
        const car_year = cleanText(req.body.car_year, 20);
        const car_price = cleanText(req.body.car_price, 80);
        const message = cleanText(req.body.message, 900);
        const page = cleanText(req.body.page, 200);

        if (!name || name.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Некорректное имя',
            });
        }

        if (!isValidPhone(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Некорректный телефон',
            });
        }

        if (!car) {
            return res.status(400).json({
                success: false,
                message: 'Не выбран автомобиль',
            });
        }

        const formattedPhone = formatPhone(phone);
        const telLink = makeTelLink(phone);

        const createdAt = new Date().toLocaleString('ru-RU', {
            timeZone: 'Asia/Krasnoyarsk',
        });

        const text = `
Новая заявка с сайта RioCar

Имя: ${name}
Телефон: ${formattedPhone}
Автомобиль: ${car}
Год: ${car_year || '—'}
Цена: ${car_price || '—'}
Дата поездки: ${tripDate || '—'}
Комментарий: ${message || '—'}
Страница: ${page || '—'}
Дата заявки: ${createdAt}
        `;

        const html = buildEmailTemplate({
            name,
            formattedPhone,
            telLink,
            car,
            car_year,
            car_price,
            date: tripDate || '—',
            message,
            page,
        });

        await transporter.sendMail({
            from: `"RioCar" <${process.env.SMTP_USER}>`,
            to: process.env.TO_EMAIL,
            subject: `Заявка RioCar: ${car}`,
            text,
            html,
        });

        return res.json({
            success: true,
            message: 'Заявка отправлена',
        });
    } catch (error) {
        console.error('Send error:', error);

        return res.status(500).json({
            success: false,
            message: 'Ошибка сервера',
        });
    }
});

app.listen(PORT, () => {
    console.log(`RioCar server started on port ${PORT}`);
});