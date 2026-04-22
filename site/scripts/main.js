// функция для загрузки компонентов из отдельных HTML-файлов, которые указаны в атрибуте data-include
async function loadComponents() {
    const elements = document.querySelectorAll('[data-include]');

    for (const element of elements) {
        const path = element.dataset.include;
        if (!path) continue;

        try {
            const response = await fetch(path);

            if (!response.ok) {
                throw new Error(`Ошибка загрузки компонента: ${path}`);
            }

            element.innerHTML = await response.text();
        } catch (error) {
            console.error(error);
        }
    }
}
// функция для инициализации мобильного меню и управления его состоянием при скролле и кликах
function initHeader() {
    const header = document.querySelector('.header');
    if (!header) return;

    const burger = header.querySelector('.header__burger');
    const mobileMenu = header.querySelector('.mobile-menu');
    const overlay = header.querySelector('.mobile-menu-overlay');
    const body = document.body;

    const setMenuState = (isOpen) => {
        burger?.classList.toggle('active', isOpen);
        mobileMenu?.classList.toggle('active', isOpen);
        overlay?.classList.toggle('active', isOpen);
        body.classList.toggle('menu-open', isOpen);
        burger?.setAttribute('aria-expanded', String(isOpen));
    };

    const closeMenu = () => setMenuState(false);

    if (burger && mobileMenu && overlay) {
        burger.addEventListener('click', () => {
            const isOpen = !burger.classList.contains('active');
            setMenuState(isOpen);
        });

        overlay.addEventListener('click', closeMenu);

        mobileMenu.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', closeMenu);
        });
    }

    let lastScroll = window.scrollY;
    let ticking = false;

    const updateHeaderOnScroll = () => {
        const currentScroll = window.scrollY;
        const menuOpen = body.classList.contains('menu-open');
        const isScrollingDown = currentScroll > lastScroll;
        const shouldHide = isScrollingDown && currentScroll > 120 && !menuOpen;

        header.classList.toggle('scrolled', currentScroll > 20);
        header.classList.toggle('header--hidden', shouldHide);

        lastScroll = currentScroll;
        ticking = false;
    };

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(updateHeaderOnScroll);
            ticking = true;
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 992) {
            closeMenu();
        }
    });
}

function initSmoothScroll() {
    const body = document.body;

    document.querySelectorAll('a[href^="#"]').forEach((link) => {
        link.addEventListener('click', (event) => {
            const href = link.getAttribute('href');

            if (!href || href === '#') return;

            const target = document.querySelector(href);
            if (!target) return;

            event.preventDefault();

            const header = document.querySelector('.header');
            const burger = document.querySelector('.header__burger');
            const mobileMenu = document.querySelector('.mobile-menu');
            const overlay = document.querySelector('.mobile-menu-overlay');

            const headerHeight = header?.offsetHeight || 0;
            const topOffset = headerHeight + 20;
            const topPosition = target.getBoundingClientRect().top + window.pageYOffset - topOffset;

            window.scrollTo({
                top: topPosition,
                behavior: 'smooth'
            });

            if (burger?.classList.contains('active')) {
                burger.classList.remove('active');
                mobileMenu?.classList.remove('active');
                overlay?.classList.remove('active');
                body.classList.remove('menu-open');
                burger.setAttribute('aria-expanded', 'false');
            }
        });
    });
}

let reviewsSwiperYandex = null;
let reviewsSwiperGis = null;

function initReviewsTabs() {
    const reviewTabs = document.querySelectorAll('.reviews-tabs__btn');
    const reviewPanes = document.querySelectorAll('.reviews-pane');

    if (!reviewTabs.length || !reviewPanes.length) return;

    reviewTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.reviewTab;

            reviewTabs.forEach((btn) => btn.classList.remove('active'));
            reviewPanes.forEach((pane) => pane.classList.remove('active'));

            tab.classList.add('active');

            const activePane = document.getElementById(`reviews-${tabName}`);
            if (activePane) {
                activePane.classList.add('active');
            }

            if (tabName === 'yandex' && reviewsSwiperYandex) {
                reviewsSwiperYandex.update();
            }

            if (tabName === 'gis' && reviewsSwiperGis) {
                reviewsSwiperGis.update();
            }
        });
    });
}

function initReviewsSliders() {
    if (typeof Swiper === 'undefined') return;

    const yandexSlider = document.querySelector('.reviews-swiper-yandex');
    const gisSlider = document.querySelector('.reviews-swiper-gis');

    if (yandexSlider) {
        reviewsSwiperYandex = new Swiper('.reviews-swiper-yandex', {
            slidesPerView: 1,
            loop: true,
            spaceBetween: 12,
            speed: 700,
            observer: true,
            observeParents: true,
            navigation: {
                nextEl: '.reviews-slider__btn--next-yandex',
                prevEl: '.reviews-slider__btn--prev-yandex',
            },
            breakpoints: {
                640: {
                    slidesPerView: 1.2,
                    spaceBetween: 14,
                },
                768: {
                    slidesPerView: 2,
                    spaceBetween: 18,
                },
                1200: {
                    slidesPerView: 3,
                    spaceBetween: 20,
                }
            }
        });
    }

    if (gisSlider) {
        reviewsSwiperGis = new Swiper('.reviews-swiper-gis', {
            slidesPerView: 1,
            loop: true,
            spaceBetween: 12,
            speed: 700,
            observer: true,
            observeParents: true,
            navigation: {
                nextEl: '.reviews-slider__btn--next-gis',
                prevEl: '.reviews-slider__btn--prev-gis',
            },
            breakpoints: {
                640: {
                    slidesPerView: 1.2,
                    spaceBetween: 14,
                },
                768: {
                    slidesPerView: 2,
                    spaceBetween: 18,
                },
                1200: {
                    slidesPerView: 3,
                    spaceBetween: 20,
                }
            }
        });
    }
}

// функция для аккордеона в секции FAQ
function initFaq() {
    const faqItems = document.querySelectorAll('.faq__item');
    if (!faqItems.length) return;

    faqItems.forEach((item) => {
        const question = item.querySelector('.faq__question');
        const answer = item.querySelector('.faq__answer');

        if (!question || !answer) return;

        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');

            faqItems.forEach((faqItem) => {
                const faqQuestion = faqItem.querySelector('.faq__question');

                faqItem.classList.remove('active');
                faqQuestion?.setAttribute('aria-expanded', 'false');
            });

            if (!isActive) {
                item.classList.add('active');
                question.setAttribute('aria-expanded', 'true');
            }
        });
    });
}

// функция для анимации появления секции "Превью маршрутов" при скролле
function initRoutesPreviewReveal() {
    const section = document.querySelector('.routes-preview');
    if (!section) return;

    const revealItems = section.querySelectorAll('.reveal');
    if (!revealItems.length) return;

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                section.classList.add('is-visible');
                obs.unobserve(section);
            }
        });
    }, {
        threshold: 0.2
    });

    observer.observe(section);
}

// функция для инициализации селекта в форме контактов, которая заполняет скрытые поля и отображает метаинформацию о выбранной машине
function initContactCarSelect() {
    const select = document.getElementById('contactCarSelect');
    const yearInput = document.getElementById('contactCarYear');
    const priceInput = document.getElementById('contactCarPrice');

    const meta = document.getElementById('contactCarMeta');
    const metaYear = document.getElementById('contactCarMetaYear');
    const metaPrice = document.getElementById('contactCarMetaPrice');

    if (!select) return;

    const updateCarMeta = () => {
        const selectedOption = select.options[select.selectedIndex];

        if (!selectedOption || !selectedOption.value) {
            if (yearInput) yearInput.value = '';
            if (priceInput) priceInput.value = '';

            if (meta) meta.hidden = true;
            if (metaYear) metaYear.textContent = '';
            if (metaPrice) metaPrice.textContent = '';
            return;
        }

        const year = selectedOption.dataset.year || '';
        const price = selectedOption.dataset.price || '';

        if (yearInput) yearInput.value = year;
        if (priceInput) priceInput.value = price;

        if (metaYear) metaYear.textContent = year ? `Год: ${year}` : '';
        if (metaPrice) metaPrice.textContent = price || '';

        if (meta) {
            meta.hidden = !(year || price);
        }
    };

    select.addEventListener('change', updateCarMeta);

    const urlParams = new URLSearchParams(window.location.search);
    const carFromUrl = urlParams.get('car');
    const yearFromUrl = urlParams.get('year');
    const priceFromUrl = urlParams.get('price');

    if (carFromUrl) {
        const options = Array.from(select.options);

        const matchedOption = options.find((option) => {
            const baseTitle = option.dataset.baseTitle || option.value;
            const year = option.dataset.year || '';

            return baseTitle === carFromUrl && (!yearFromUrl || year === yearFromUrl);
        });

        if (matchedOption) {
            matchedOption.selected = true;
        }

        if (yearFromUrl && yearInput) {
            yearInput.value = yearFromUrl;
        }

        if (priceFromUrl && priceInput) {
            priceInput.value = priceFromUrl;
        }
    }

    updateCarMeta();
}

function initPhoneMask() {
    const phoneInputs = document.querySelectorAll('input[type="tel"]');

    if (!phoneInputs.length) return;

    const getInputNumbersValue = (input) => {
        return input.value.replace(/\D/g, '');
    };

    const onPhoneInput = (event) => {
        const input = event.target;
        let inputNumbersValue = getInputNumbersValue(input);
        const selectionStart = input.selectionStart;

        if (!inputNumbersValue) {
            input.value = '';
            return;
        }

        if (input.value.length !== selectionStart && event.data && /\D/g.test(event.data)) {
            input.value = inputNumbersValue;
            return;
        }

        if (inputNumbersValue[0] === '8') {
            inputNumbersValue = '7' + inputNumbersValue.slice(1);
        }

        if (inputNumbersValue[0] !== '7') {
            inputNumbersValue = '7' + inputNumbersValue;
        }

        inputNumbersValue = inputNumbersValue.substring(0, 11);

        let formattedInputValue = '+7';

        if (inputNumbersValue.length > 1) {
            formattedInputValue += ' (' + inputNumbersValue.substring(1, 4);
        }

        if (inputNumbersValue.length >= 5) {
            formattedInputValue += ') ' + inputNumbersValue.substring(4, 7);
        }

        if (inputNumbersValue.length >= 8) {
            formattedInputValue += '-' + inputNumbersValue.substring(7, 9);
        }

        if (inputNumbersValue.length >= 10) {
            formattedInputValue += '-' + inputNumbersValue.substring(9, 11);
        }

        input.value = formattedInputValue;
    };

    const onPhoneKeyDown = (event) => {
        const input = event.target;
        if (event.key === 'Backspace' && getInputNumbersValue(input).length === 1) {
            input.value = '';
        }
    };

    const onPhonePaste = (event) => {
        const pasted = event.clipboardData || window.clipboardData;
        const input = event.target;
        const inputNumbersValue = getInputNumbersValue(input);

        if (pasted) {
            const pastedText = pasted.getData('Text');
            if (/\D/g.test(pastedText)) {
                input.value = inputNumbersValue;
            }
        }
    };

    const onPhoneFocus = (event) => {
        const input = event.target;
        if (!input.value) {
            input.value = '+7 ';
        }
    };

    const onPhoneBlur = (event) => {
        const input = event.target;
        if (getInputNumbersValue(input).length < 11) {
            input.value = '';
        }
    };

    phoneInputs.forEach((input) => {
        input.addEventListener('input', onPhoneInput);
        input.addEventListener('keydown', onPhoneKeyDown);
        input.addEventListener('paste', onPhonePaste);
        input.addEventListener('focus', onPhoneFocus);
        input.addEventListener('blur', onPhoneBlur);
    });
}

// вызов
async function initApp() {
    await loadComponents();

    initHeader();
    initSmoothScroll();
    initFaq();
    initRoutesPreviewReveal();
    initContactCarSelect();
    initPhoneMask();
    initReviewsTabs();
    initReviewsSliders();
}

document.addEventListener('DOMContentLoaded', () => {
    initApp().catch((error) => {
        console.error('Ошибка инициализации приложения:', error);
    });
});