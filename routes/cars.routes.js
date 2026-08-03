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
const CAR_UPLOAD_DIR = path.join(PROJECT_DIR, 'uploads', 'cars');

const smallJson = express.json({ limit: '120kb' });
const imageJson = express.json({ limit: '14mb' });

const CAR_CATEGORIES = new Set(['ECONOM', 'COMFORT', 'PREMIUM']);
const VISIBILITY_FILTERS = new Set(['ALL', 'ACTIVE', 'HIDDEN']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES_PER_CAR = 12;
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

function normalizeMultiline(value, maxLength = 3000) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[<>]/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

function parseOptionalInteger(value, { min = 0, max = 100000000 } = {}) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const number = Number.parseInt(String(value), 10);

  if (!Number.isSafeInteger(number) || number < min || number > max) {
    return null;
  }

  return number;
}

function parseRequiredInteger(value, fallback, { min = 0, max = 100000 } = {}) {
  const number = Number.parseInt(String(value ?? ''), 10);

  if (!Number.isSafeInteger(number) || number < min || number > max) {
    return fallback;
  }

  return number;
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

function normalizeCategory(value) {
  const category = String(value ?? '')
    .trim()
    .toUpperCase();

  return CAR_CATEGORIES.has(category) ? category : '';
}

function parseFeatures(value) {
  const source = Array.isArray(value)
    ? value
    : String(value ?? '').split(/\r?\n/);

  const unique = new Set();

  for (const item of source) {
    const feature = normalizeSingleLine(item, 120);

    if (feature) {
      unique.add(feature);
    }

    if (unique.size >= 30) {
      break;
    }
  }

  return [...unique];
}

function readFeatures(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return parseFeatures(parsed);
  } catch {
    return [];
  }
}

const transliterationMap = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function slugify(value) {
  const source = normalizeSingleLine(value, 160).toLocaleLowerCase('ru-RU');

  const transliterated = [...source]
    .map((character) => transliterationMap[character] ?? character)
    .join('');

  return transliterated
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

async function createUniqueSlug(requestedSlug, title, ignoredCarId = null) {
  const base = slugify(requestedSlug || title) || `car-${Date.now()}`;
  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = await prisma.car.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing || existing.id === ignoredCarId) {
      return candidate;
    }

    candidate = `${base}-${suffix}`.slice(0, 90);
    suffix += 1;
  }
}

function normalizeCarPayload(body) {
  const currentYear = new Date().getFullYear();

  const title = normalizeSingleLine(body?.title, 120);
  const category = normalizeCategory(body?.category);
  const year = parseOptionalInteger(body?.year, {
    min: 1950,
    max: currentYear + 1,
  });
  const seats = parseOptionalInteger(body?.seats, { min: 1, max: 60 });
  const pricePerDay = parseOptionalInteger(body?.pricePerDay, {
    min: 0,
    max: 100000000,
  });
  const deposit = parseOptionalInteger(body?.deposit, {
    min: 0,
    max: 100000000,
  });

  return {
    title,
    requestedSlug: normalizeSingleLine(body?.slug, 100),
    category,
    year,
    engine: normalizeSingleLine(body?.engine, 120) || null,
    mileage: normalizeSingleLine(body?.mileage, 120) || null,
    drive: normalizeSingleLine(body?.drive, 120) || null,
    gearbox: normalizeSingleLine(body?.gearbox, 120) || null,
    fuel: normalizeSingleLine(body?.fuel, 120) || null,
    bodyType: normalizeSingleLine(body?.bodyType, 120) || null,
    seats,
    complectation: normalizeMultiline(body?.complectation, 3000) || null,
    rentalTerms: normalizeMultiline(body?.rentalTerms, 3000) || null,
    description: normalizeMultiline(body?.description, 5000) || null,
    features: parseFeatures(body?.features),
    minRentalDays: parseRequiredInteger(body?.minRentalDays, 1, {
      min: 1,
      max: 365,
    }),
    pricePerDay,
    deposit,
    isActive: normalizeBoolean(body?.isActive, true),
    sortOrder: parseRequiredInteger(body?.sortOrder, 0, {
      min: 0,
      max: 100000,
    }),
  };
}

function validateCarPayload(payload) {
  if (payload.title.length < 2) {
    return 'Введите название автомобиля.';
  }

  if (!payload.category) {
    return 'Выберите класс автомобиля.';
  }

  return '';
}

function serializeCar(car) {
  const images = Array.isArray(car.images)
    ? [...car.images].sort((first, second) => {
        if (first.isPrimary !== second.isPrimary) {
          return first.isPrimary ? -1 : 1;
        }

        if (first.sortOrder !== second.sortOrder) {
          return first.sortOrder - second.sortOrder;
        }

        return first.id - second.id;
      })
    : [];

  return {
    ...car,
    features: readFeatures(car.features),
    images,
    primaryImage: images.find((image) => image.isPrimary) || images[0] || null,
  };
}

function normalizeSearch(value) {
  return normalizeSingleLine(value, 100).toLocaleLowerCase('ru-RU');
}

function carMatchesSearch(car, search) {
  if (!search) {
    return true;
  }

  const fields = [
    car.title,
    car.slug,
    car.engine,
    car.gearbox,
    car.drive,
    car.fuel,
    car.bodyType,
    car.year,
  ];

  return fields.some((field) =>
    String(field ?? '')
      .toLocaleLowerCase('ru-RU')
      .includes(search),
  );
}

function detectImageType(buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { extension: 'jpg', mimeType: 'image/jpeg' };
  }

  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { extension: 'png', mimeType: 'image/png' };
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { extension: 'webp', mimeType: 'image/webp' };
  }

  return null;
}

function decodeImagePayload(value) {
  const source = String(value ?? '')
    .replace(/^data:[^;]+;base64,/i, '')
    .replace(/\s+/g, '');

  if (!source || !/^[A-Za-z0-9+/]+={0,2}$/.test(source)) {
    return null;
  }

  const buffer = Buffer.from(source, 'base64');

  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    return null;
  }

  const type = detectImageType(buffer);

  if (!type) {
    return null;
  }

  return { buffer, ...type };
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

async function removeUploadedImage(imagePath) {
  const normalizedPath = String(imagePath || '');

  if (!normalizedPath.startsWith('/uploads/cars/')) {
    return;
  }

  const fileName = path.basename(normalizedPath);
  const absolutePath = path.join(CAR_UPLOAD_DIR, fileName);

  await unlink(absolutePath).catch(() => undefined);
}

async function findCarOrNull(carId) {
  return prisma.car.findUnique({
    where: { id: carId },
    include: {
      images: {
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      },
    },
  });
}

router.get('/', async (req, res, next) => {
  try {
    const search = normalizeSearch(req.query.search);
    const category = String(req.query.category || 'ALL')
      .trim()
      .toUpperCase();
    const visibility = String(req.query.visibility || 'ALL')
      .trim()
      .toUpperCase();

    if (category !== 'ALL' && !CAR_CATEGORIES.has(category)) {
      return res.status(400).json({
        success: false,
        message: 'Передан неизвестный класс автомобиля.',
      });
    }

    if (!VISIBILITY_FILTERS.has(visibility)) {
      return res.status(400).json({
        success: false,
        message: 'Передан неизвестный фильтр публикации.',
      });
    }

    const page = parsePositiveInteger(req.query.page, 1);
    const limit = Math.min(parsePositiveInteger(req.query.limit, 20), 50);

    const allCars = await prisma.car.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      include: {
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
        },
      },
    });

    const filtered = allCars.filter((car) => {
      if (!carMatchesSearch(car, search)) {
        return false;
      }

      if (category !== 'ALL' && car.category !== category) {
        return false;
      }

      if (visibility === 'ACTIVE' && !car.isActive) {
        return false;
      }

      if (visibility === 'HIDDEN' && car.isActive) {
        return false;
      }

      return true;
    });

    const total = filtered.length;
    const cars = filtered
      .slice((page - 1) * limit, page * limit)
      .map(serializeCar);

    return res.status(200).json({
      success: true,
      cars,
      stats: {
        total: allCars.length,
        active: allCars.filter((car) => car.isActive).length,
        hidden: allCars.filter((car) => !car.isActive).length,
      },
      filters: {
        search,
        category,
        visibility,
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', smallJson, requireCsrf, async (req, res, next) => {
  try {
    const payload = normalizeCarPayload(req.body);
    const validationError = validateCarPayload(payload);

    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const slug = await createUniqueSlug(payload.requestedSlug, payload.title);

    const car = await prisma.car.create({
      data: {
        title: payload.title,
        slug,
        category: payload.category,
        year: payload.year,
        engine: payload.engine,
        mileage: payload.mileage,
        drive: payload.drive,
        gearbox: payload.gearbox,
        fuel: payload.fuel,
        bodyType: payload.bodyType,
        seats: payload.seats,
        complectation: payload.complectation,
        rentalTerms: payload.rentalTerms,
        description: payload.description,
        features: JSON.stringify(payload.features),
        minRentalDays: payload.minRentalDays,
        pricePerDay: payload.pricePerDay,
        deposit: payload.deposit,
        isActive: payload.isActive,
        sortOrder: payload.sortOrder,
      },
      include: { images: true },
    });

    return res.status(201).json({
      success: true,
      message: 'Автомобиль добавлен.',
      car: serializeCar(car),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/images', imageJson, requireCsrf, async (req, res, next) => {
  let uploadedPath = '';

  try {
    const carId = parseEntityId(req.params.id);

    if (!carId) {
      return res.status(400).json({
        success: false,
        message: 'Некорректный идентификатор автомобиля.',
      });
    }

    const car = await prisma.car.findUnique({
      where: { id: carId },
      select: {
        id: true,
        title: true,
        slug: true,
        _count: { select: { images: true } },
      },
    });

    if (!car) {
      return res.status(404).json({
        success: false,
        message: 'Автомобиль не найден.',
      });
    }

    if (car._count.images >= MAX_IMAGES_PER_CAR) {
      return res.status(409).json({
        success: false,
        message: `Для одного автомобиля можно загрузить не более ${MAX_IMAGES_PER_CAR} фотографий.`,
      });
    }

    const decoded = decodeImagePayload(req.body?.dataBase64);

    if (!decoded) {
      return res.status(400).json({
        success: false,
        message: 'Поддерживаются JPG, PNG и WebP размером до 8 МБ.',
      });
    }

    let optimizedBuffer;

    try {
      optimizedBuffer = await convertImageToWebp(decoded.buffer);
    } catch {
      return res.status(400).json({
        success: false,
        message: 'Не удалось обработать изображение. Проверьте, что файл не повреждён.',
      });
    }

    await mkdir(CAR_UPLOAD_DIR, { recursive: true });

    const fileName = `${car.slug}-${Date.now()}-${randomUUID().slice(0, 8)}.webp`;
    const absolutePath = path.join(CAR_UPLOAD_DIR, fileName);
    uploadedPath = `/uploads/cars/${fileName}`;

    await writeFile(absolutePath, optimizedBuffer, { flag: 'wx' });

    const latestImage = await prisma.carImage.findFirst({
      where: { carId },
      orderBy: [{ sortOrder: 'desc' }, { id: 'desc' }],
      select: { sortOrder: true },
    });

    const shouldBePrimary =
      car._count.images === 0 || normalizeBoolean(req.body?.isPrimary, false);

    const image = await prisma.$transaction(async (transaction) => {
      if (shouldBePrimary) {
        await transaction.carImage.updateMany({
          where: { carId },
          data: { isPrimary: false },
        });
      }

      return transaction.carImage.create({
        data: {
          carId,
          imagePath: uploadedPath,
          alt: normalizeSingleLine(req.body?.alt, 160) || car.title,
          isPrimary: shouldBePrimary,
          sortOrder: (latestImage?.sortOrder ?? -1) + 1,
        },
      });
    });

    return res.status(201).json({
      success: true,
      message: 'Фотография загружена.',
      image,
    });
  } catch (error) {
    if (uploadedPath) {
      await removeUploadedImage(uploadedPath);
    }

    return next(error);
  }
});

router.patch(
  '/:id/images/order',
  smallJson,
  requireCsrf,
  async (req, res, next) => {
    try {
      const carId = parseEntityId(req.params.id);
      const imageIds = Array.isArray(req.body?.imageIds)
        ? req.body.imageIds.map(parseEntityId).filter(Boolean)
        : [];

      if (
        !carId ||
        imageIds.length === 0 ||
        new Set(imageIds).size !== imageIds.length
      ) {
        return res.status(400).json({
          success: false,
          message: 'Передан некорректный порядок фотографий.',
        });
      }

      const images = await prisma.carImage.findMany({
        where: { carId },
        select: { id: true },
      });

      const actualIds = images.map((image) => image.id).sort((a, b) => a - b);
      const requestedIds = [...imageIds].sort((a, b) => a - b);

      if (
        actualIds.length !== requestedIds.length ||
        actualIds.some((id, index) => id !== requestedIds[index])
      ) {
        return res.status(400).json({
          success: false,
          message: 'Список фотографий не совпадает с автомобилем.',
        });
      }

      await prisma.$transaction(
        imageIds.map((imageId, index) =>
          prisma.carImage.update({
            where: { id: imageId },
            data: { sortOrder: index },
          }),
        ),
      );

      return res.status(200).json({
        success: true,
        message: 'Порядок фотографий сохранён.',
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  '/:id/images/:imageId',
  smallJson,
  requireCsrf,
  async (req, res, next) => {
    try {
      const carId = parseEntityId(req.params.id);
      const imageId = parseEntityId(req.params.imageId);

      if (!carId || !imageId) {
        return res.status(400).json({
          success: false,
          message: 'Некорректный идентификатор фотографии.',
        });
      }

      const existingImage = await prisma.carImage.findFirst({
        where: { id: imageId, carId },
      });

      if (!existingImage) {
        return res.status(404).json({
          success: false,
          message: 'Фотография не найдена.',
        });
      }

      const alt = normalizeSingleLine(req.body?.alt, 160);
      const makePrimary = normalizeBoolean(req.body?.isPrimary, false);

      const image = await prisma.$transaction(async (transaction) => {
        if (makePrimary) {
          await transaction.carImage.updateMany({
            where: { carId },
            data: { isPrimary: false },
          });
        }

        return transaction.carImage.update({
          where: { id: imageId },
          data: {
            alt: alt || null,
            ...(makePrimary ? { isPrimary: true } : {}),
          },
        });
      });

      return res.status(200).json({
        success: true,
        message: 'Фотография обновлена.',
        image,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.delete('/:id/images/:imageId', requireCsrf, async (req, res, next) => {
  try {
    const carId = parseEntityId(req.params.id);
    const imageId = parseEntityId(req.params.imageId);

    if (!carId || !imageId) {
      return res.status(400).json({
        success: false,
        message: 'Некорректный идентификатор фотографии.',
      });
    }

    const image = await prisma.carImage.findFirst({
      where: { id: imageId, carId },
    });

    if (!image) {
      return res.status(404).json({
        success: false,
        message: 'Фотография не найдена.',
      });
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.carImage.delete({ where: { id: imageId } });

      if (image.isPrimary) {
        const replacement = await transaction.carImage.findFirst({
          where: { carId },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: { id: true },
        });

        if (replacement) {
          await transaction.carImage.update({
            where: { id: replacement.id },
            data: { isPrimary: true },
          });
        }
      }
    });

    await removeUploadedImage(image.imagePath);

    return res.status(200).json({
      success: true,
      message: 'Фотография удалена.',
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const carId = parseEntityId(req.params.id);

    if (!carId) {
      return res.status(400).json({
        success: false,
        message: 'Некорректный идентификатор автомобиля.',
      });
    }

    const car = await findCarOrNull(carId);

    if (!car) {
      return res.status(404).json({
        success: false,
        message: 'Автомобиль не найден.',
      });
    }

    return res.status(200).json({ success: true, car: serializeCar(car) });
  } catch (error) {
    return next(error);
  }
});

router.patch(
  '/:id/visibility',
  smallJson,
  requireCsrf,
  async (req, res, next) => {
    try {
      const carId = parseEntityId(req.params.id);

      if (!carId || typeof req.body?.isActive !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'Некорректные данные публикации.',
        });
      }

      const existing = await prisma.car.findUnique({
        where: { id: carId },
        select: { id: true },
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Автомобиль не найден.',
        });
      }

      const car = await prisma.car.update({
        where: { id: carId },
        data: { isActive: req.body.isActive },
        select: { id: true, isActive: true, updatedAt: true },
      });

      return res.status(200).json({
        success: true,
        message: car.isActive
          ? 'Автомобиль опубликован.'
          : 'Автомобиль скрыт с сайта.',
        car,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch('/:id', smallJson, requireCsrf, async (req, res, next) => {
  try {
    const carId = parseEntityId(req.params.id);

    if (!carId) {
      return res.status(400).json({
        success: false,
        message: 'Некорректный идентификатор автомобиля.',
      });
    }

    const existing = await prisma.car.findUnique({
      where: { id: carId },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Автомобиль не найден.',
      });
    }

    const payload = normalizeCarPayload(req.body);
    const validationError = validateCarPayload(payload);

    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const slug = await createUniqueSlug(
      payload.requestedSlug,
      payload.title,
      carId,
    );

    const car = await prisma.car.update({
      where: { id: carId },
      data: {
        title: payload.title,
        slug,
        category: payload.category,
        year: payload.year,
        engine: payload.engine,
        mileage: payload.mileage,
        drive: payload.drive,
        gearbox: payload.gearbox,
        fuel: payload.fuel,
        bodyType: payload.bodyType,
        seats: payload.seats,
        complectation: payload.complectation,
        rentalTerms: payload.rentalTerms,
        description: payload.description,
        features: JSON.stringify(payload.features),
        minRentalDays: payload.minRentalDays,
        pricePerDay: payload.pricePerDay,
        deposit: payload.deposit,
        isActive: payload.isActive,
        sortOrder: payload.sortOrder,
      },
      include: {
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Автомобиль сохранён.',
      car: serializeCar(car),
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', requireCsrf, async (req, res, next) => {
  try {
    const carId = parseEntityId(req.params.id);

    if (!carId) {
      return res.status(400).json({
        success: false,
        message: 'Некорректный идентификатор автомобиля.',
      });
    }

    const car = await prisma.car.findUnique({
      where: { id: carId },
      include: { images: true },
    });

    if (!car) {
      return res.status(404).json({
        success: false,
        message: 'Автомобиль не найден.',
      });
    }

    await prisma.car.delete({ where: { id: carId } });

    await Promise.all(
      car.images.map((image) => removeUploadedImage(image.imagePath)),
    );

    return res.status(200).json({
      success: true,
      message: 'Автомобиль удалён.',
    });
  } catch (error) {
    return next(error);
  }
});

router.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Файл или данные слишком большие.',
    });
  }

  return next(error);
});

export default router;
