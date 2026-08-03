import express, { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

import prisma from '../lib/prisma.js';
import requireAuth from '../middleware/require-auth.js';
import requireCsrf from '../middleware/require-csrf.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_DIR = path.resolve(__dirname, '..');
const PUBLICATION_UPLOAD_DIR = path.join(PROJECT_DIR, 'uploads', 'publications');

const smallJson = express.json({ limit: '160kb' });
const imageJson = express.json({ limit: '14mb' });

const PUBLICATION_TYPES = new Set(['NEWS', 'PROMOTION', 'OFFER']);
const VISIBILITY_FILTERS = new Set(['ALL', 'ACTIVE', 'HIDDEN']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1920;
const WEBP_QUALITY = 82;

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
});

router.use(requireAuth);

function parsePositiveInteger(value, fallback) {
  const number = Number.parseInt(String(value ?? ''), 10);

  if (!Number.isSafeInteger(number) || number < 1) {
    return fallback;
  }

  return number;
}

function parseEntityId(value) {
  const id = Number.parseInt(String(value ?? ''), 10);

  if (!Number.isSafeInteger(id) || id < 1) {
    return null;
  }

  return id;
}

function normalizeSingleLine(value, maxLength = 500) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeMultiline(value, maxLength = 12000) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[<>]/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, maxLength);
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true' || value === '1' || value === 1) {
    return true;
  }

  if (value === 'false' || value === '0' || value === 0) {
    return false;
  }

  return fallback;
}

function parseSortOrder(value) {
  const number = Number.parseInt(String(value ?? ''), 10);

  if (!Number.isSafeInteger(number) || number < 0 || number > 100000) {
    return 0;
  }

  return number;
}

function normalizeType(value) {
  const type = String(value ?? '').trim().toUpperCase();
  return PUBLICATION_TYPES.has(type) ? type : '';
}

function parseOptionalDate(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

const transliterationMap = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya',
};

function slugify(value) {
  const source = normalizeSingleLine(value, 180).toLocaleLowerCase('ru-RU');

  const transliterated = [...source]
    .map((character) => transliterationMap[character] ?? character)
    .join('');

  return transliterated
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

async function createUniqueSlug(requestedSlug, title, ignoredId = null) {
  const base = slugify(requestedSlug || title) || `publication-${Date.now()}`;
  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = await prisma.publication.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing || existing.id === ignoredId) {
      return candidate;
    }

    candidate = `${base}-${suffix}`.slice(0, 100);
    suffix += 1;
  }
}

function normalizePayload(body) {
  return {
    title: normalizeSingleLine(body?.title, 160),
    requestedSlug: normalizeSingleLine(body?.slug, 110),
    type: normalizeType(body?.type),
    excerpt: normalizeMultiline(body?.excerpt, 500) || null,
    content: normalizeMultiline(body?.content, 16000),
    coverAlt: normalizeSingleLine(body?.coverAlt, 180) || null,
    isActive: normalizeBoolean(body?.isActive, true),
    showOnHome: normalizeBoolean(body?.showOnHome, true),
    isPinned: normalizeBoolean(body?.isPinned, false),
    sortOrder: parseSortOrder(body?.sortOrder),
    publishedAt: parseOptionalDate(body?.publishedAt),
    startsAt: parseOptionalDate(body?.startsAt),
    endsAt: parseOptionalDate(body?.endsAt),
  };
}

function validatePayload(payload) {
  if (payload.title.length < 2) {
    return 'Введите заголовок публикации.';
  }

  if (!payload.type) {
    return 'Выберите тип публикации.';
  }

  if (payload.content.length < 10) {
    return 'Добавьте описание публикации.';
  }

  if (payload.startsAt && payload.endsAt && payload.startsAt > payload.endsAt) {
    return 'Дата окончания не может быть раньше даты начала.';
  }

  return '';
}

function serializePublication(publication) {
  return {
    id: publication.id,
    type: publication.type,
    title: publication.title,
    slug: publication.slug,
    excerpt: publication.excerpt,
    content: publication.content,
    coverImage: publication.coverImage,
    coverAlt: publication.coverAlt,
    isActive: publication.isActive,
    showOnHome: publication.showOnHome,
    isPinned: publication.isPinned,
    sortOrder: publication.sortOrder,
    publishedAt: publication.publishedAt?.toISOString() || null,
    startsAt: publication.startsAt?.toISOString() || null,
    endsAt: publication.endsAt?.toISOString() || null,
    createdAt: publication.createdAt.toISOString(),
    updatedAt: publication.updatedAt.toISOString(),
  };
}

function getExtensionFromBuffer(buffer) {
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'webp';
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }

  return '';
}

function decodeImageDataUrl(dataUrl) {
  const match = String(dataUrl ?? '').match(
    /^data:image\/(?:jpeg|jpg|png|webp);base64,([a-zA-Z0-9+/=]+)$/,
  );

  if (!match) {
    throw new Error('Разрешены изображения JPG, PNG и WebP.');
  }

  const buffer = Buffer.from(match[1], 'base64');

  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Размер изображения должен быть не больше 8 МБ.');
  }

  const extension = getExtensionFromBuffer(buffer);

  if (!extension) {
    throw new Error('Формат изображения не поддерживается.');
  }

  return { buffer, extension };
}

async function convertImageToWebp(buffer) {
  return sharp(buffer, {
    failOn: 'error',
    limitInputPixels: 40_000_000,
  })
    .rotate()
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality: WEBP_QUALITY,
      effort: 4,
      smartSubsample: true,
    })
    .toBuffer();
}

function getUploadedFilePath(imagePath) {
  const prefix = '/uploads/publications/';

  if (!String(imagePath || '').startsWith(prefix)) {
    return null;
  }

  const fileName = path.basename(imagePath);
  const filePath = path.join(PUBLICATION_UPLOAD_DIR, fileName);

  if (!filePath.startsWith(PUBLICATION_UPLOAD_DIR)) {
    return null;
  }

  return filePath;
}

async function removeUploadedImage(imagePath) {
  const filePath = getUploadedFilePath(imagePath);

  if (!filePath) {
    return;
  }

  await unlink(filePath).catch(() => undefined);
}

router.get('/', async (req, res, next) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const limit = Math.min(parsePositiveInteger(req.query.limit, 20), 50);
    const type = String(req.query.type || 'ALL').toUpperCase();
    const visibility = String(req.query.visibility || 'ALL').toUpperCase();
    const search = normalizeSingleLine(req.query.search, 120);

    const where = {};

    if (PUBLICATION_TYPES.has(type)) {
      where.type = type;
    }

    if (VISIBILITY_FILTERS.has(visibility) && visibility !== 'ALL') {
      where.isActive = visibility === 'ACTIVE';
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { slug: { contains: search } },
        { excerpt: { contains: search } },
      ];
    }

    const total = await prisma.publication.count({ where });
    const pages = Math.max(Math.ceil(total / limit), 1);
    const safePage = Math.min(page, pages);

    const [publications, totalAll, active, hidden, onHome] =
      await prisma.$transaction([
        prisma.publication.findMany({
          where,
          orderBy: [
            { isPinned: 'desc' },
            { sortOrder: 'asc' },
            { createdAt: 'desc' },
          ],
          skip: (safePage - 1) * limit,
          take: limit,
        }),
        prisma.publication.count(),
        prisma.publication.count({ where: { isActive: true } }),
        prisma.publication.count({ where: { isActive: false } }),
        prisma.publication.count({
          where: { isActive: true, showOnHome: true },
        }),
      ]);

    return res.json({
      success: true,
      publications: publications.map(serializePublication),
      pagination: {
        page: safePage,
        pages,
        total,
        limit,
      },
      stats: {
        total: totalAll,
        active,
        hidden,
        onHome,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', smallJson, requireCsrf, async (req, res, next) => {
  try {
    const payload = normalizePayload(req.body);
    const validationMessage = validatePayload(payload);

    if (validationMessage) {
      return res.status(400).json({ success: false, message: validationMessage });
    }

    const slug = await createUniqueSlug(payload.requestedSlug, payload.title);

    const publication = await prisma.publication.create({
      data: {
        type: payload.type,
        title: payload.title,
        slug,
        excerpt: payload.excerpt,
        content: payload.content,
        coverAlt: payload.coverAlt,
        isActive: payload.isActive,
        showOnHome: payload.showOnHome,
        isPinned: payload.isPinned,
        sortOrder: payload.sortOrder,
        publishedAt: payload.publishedAt,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Публикация создана.',
      publication: serializePublication(publication),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const publicationId = parseEntityId(req.params.id);

    if (!publicationId) {
      return res.status(400).json({ success: false, message: 'Некорректный идентификатор.' });
    }

    const publication = await prisma.publication.findUnique({
      where: { id: publicationId },
    });

    if (!publication) {
      return res.status(404).json({ success: false, message: 'Публикация не найдена.' });
    }

    return res.json({
      success: true,
      publication: serializePublication(publication),
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id', smallJson, requireCsrf, async (req, res, next) => {
  try {
    const publicationId = parseEntityId(req.params.id);

    if (!publicationId) {
      return res.status(400).json({ success: false, message: 'Некорректный идентификатор.' });
    }

    const existing = await prisma.publication.findUnique({
      where: { id: publicationId },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Публикация не найдена.' });
    }

    const payload = normalizePayload(req.body);
    const validationMessage = validatePayload(payload);

    if (validationMessage) {
      return res.status(400).json({ success: false, message: validationMessage });
    }

    const slug = await createUniqueSlug(
      payload.requestedSlug,
      payload.title,
      publicationId,
    );

    const publication = await prisma.publication.update({
      where: { id: publicationId },
      data: {
        type: payload.type,
        title: payload.title,
        slug,
        excerpt: payload.excerpt,
        content: payload.content,
        coverAlt: payload.coverAlt,
        isActive: payload.isActive,
        showOnHome: payload.showOnHome,
        isPinned: payload.isPinned,
        sortOrder: payload.sortOrder,
        publishedAt: payload.publishedAt,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
      },
    });

    return res.json({
      success: true,
      message: 'Публикация сохранена.',
      publication: serializePublication(publication),
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id/visibility', smallJson, requireCsrf, async (req, res, next) => {
  try {
    const publicationId = parseEntityId(req.params.id);

    if (!publicationId) {
      return res.status(400).json({ success: false, message: 'Некорректный идентификатор.' });
    }

    const isActive = normalizeBoolean(req.body?.isActive, false);

    const publication = await prisma.publication.update({
      where: { id: publicationId },
      data: { isActive },
    });

    return res.json({
      success: true,
      message: isActive ? 'Публикация опубликована.' : 'Публикация скрыта.',
      publication: serializePublication(publication),
    });
  } catch (error) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Публикация не найдена.' });
    }

    return next(error);
  }
});

router.post('/:id/cover', imageJson, requireCsrf, async (req, res, next) => {
  let writtenPath = null;

  try {
    const publicationId = parseEntityId(req.params.id);

    if (!publicationId) {
      return res.status(400).json({ success: false, message: 'Некорректный идентификатор.' });
    }

    const publication = await prisma.publication.findUnique({
      where: { id: publicationId },
      select: { id: true, coverImage: true, title: true },
    });

    if (!publication) {
      return res.status(404).json({ success: false, message: 'Публикация не найдена.' });
    }

    const { buffer } = decodeImageDataUrl(req.body?.dataUrl);

    let optimizedBuffer;

    try {
      optimizedBuffer = await convertImageToWebp(buffer);
    } catch {
      return res.status(400).json({
        success: false,
        message: 'Не удалось обработать изображение. Проверьте, что файл не повреждён.',
      });
    }

    const fileName = `${Date.now()}-${randomUUID()}.webp`;
    const imagePath = `/uploads/publications/${fileName}`;
    writtenPath = path.join(PUBLICATION_UPLOAD_DIR, fileName);

    await mkdir(PUBLICATION_UPLOAD_DIR, { recursive: true });
    await writeFile(writtenPath, optimizedBuffer, { flag: 'wx' });

    const coverAlt =
      normalizeSingleLine(req.body?.coverAlt, 180) ||
      publication.title;

    const updated = await prisma.publication.update({
      where: { id: publicationId },
      data: {
        coverImage: imagePath,
        coverAlt,
      },
    });

    await removeUploadedImage(publication.coverImage);

    return res.status(201).json({
      success: true,
      message: 'Обложка загружена.',
      publication: serializePublication(updated),
    });
  } catch (error) {
    if (writtenPath) {
      await unlink(writtenPath).catch(() => undefined);
    }

    if (error instanceof Error && /изображ|формат|МБ/.test(error.message)) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return next(error);
  }
});

router.delete('/:id/cover', smallJson, requireCsrf, async (req, res, next) => {
  try {
    const publicationId = parseEntityId(req.params.id);

    if (!publicationId) {
      return res.status(400).json({ success: false, message: 'Некорректный идентификатор.' });
    }

    const publication = await prisma.publication.findUnique({
      where: { id: publicationId },
      select: { coverImage: true },
    });

    if (!publication) {
      return res.status(404).json({ success: false, message: 'Публикация не найдена.' });
    }

    const updated = await prisma.publication.update({
      where: { id: publicationId },
      data: { coverImage: null },
    });

    await removeUploadedImage(publication.coverImage);

    return res.json({
      success: true,
      message: 'Обложка удалена.',
      publication: serializePublication(updated),
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', smallJson, requireCsrf, async (req, res, next) => {
  try {
    const publicationId = parseEntityId(req.params.id);

    if (!publicationId) {
      return res.status(400).json({ success: false, message: 'Некорректный идентификатор.' });
    }

    const publication = await prisma.publication.findUnique({
      where: { id: publicationId },
      select: { coverImage: true },
    });

    if (!publication) {
      return res.status(404).json({ success: false, message: 'Публикация не найдена.' });
    }

    await prisma.publication.delete({ where: { id: publicationId } });
    await removeUploadedImage(publication.coverImage);

    return res.json({ success: true, message: 'Публикация удалена.' });
  } catch (error) {
    return next(error);
  }
});

router.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Файл слишком большой. Максимальный размер — 8 МБ.',
    });
  }

  return next(error);
});

export default router;
