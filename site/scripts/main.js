async function loadComponents() {
    const elements = document.querySelectorAll('[data-include]');

    for (const element of elements) {
        const path = element.dataset.include;
        if (!path) continue;

        try {
            const response = await fetch(path);
            if (!response.ok) throw new Error(`Ошибка загрузки компонента: ${path}`);

            element.innerHTML = await response.text();
        } catch (error) {
            console.error(error);
        }
    }
}

function initHeader() {
    const header = document.querySelector('.header');
    if (!header) return;

    const burger = document.querySelector('.header__burger');
    const mobileMenu = document.querySelector('.mobile-menu');
    const overlay = document.querySelector('.mobile-menu-overlay');
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

    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.scrollY;
        const menuOpen = body.classList.contains('menu-open');

        header.classList.toggle('scrolled', currentScroll > 20);
        header.classList.toggle(
            'header--hidden',
            currentScroll > lastScroll && currentScroll > 120 && !menuOpen
        );

        lastScroll = currentScroll;
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadComponents();
    initHeader();
});

// 3. Плавный скролл к секциям

document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('.header');
    const burger = document.querySelector('.header__burger');
    const mobileMenu = document.querySelector('.mobile-menu');
    const overlay = document.querySelector('.mobile-menu-overlay');
    const body = document.body;

    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (!href || href === '#') return;

            const target = document.querySelector(href);
            if (!target) return;

            e.preventDefault();

            const headerHeight = header?.offsetHeight || 0;
            const topOffset = headerHeight + 20;
            const topPos = target.getBoundingClientRect().top + window.pageYOffset - topOffset;

            window.scrollTo({
                top: topPos,
                behavior: 'smooth'
            });

            if (burger && mobileMenu && burger.classList.contains('active')) {
                burger.classList.remove('active');
                mobileMenu.classList.remove('active');
                overlay?.classList.remove('active');
                body.classList.remove('menu-open');
                burger.setAttribute('aria-expanded', 'false');
            }
        });
    });
});

//  FAQ

document.addEventListener('DOMContentLoaded', () => {
    const faqItems = document.querySelectorAll('.faq__item');

    faqItems.forEach((item) => {
        const question = item.querySelector('.faq__question');

        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');

            faqItems.forEach((faqItem) => {
                faqItem.classList.remove('active');
            });

            if (!isActive) {
                item.classList.add('active');
            }
        });
    });
});