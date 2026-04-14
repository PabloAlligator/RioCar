async function loadComponents() {
    const elements = document.querySelectorAll('[data-include]');

    for (const element of elements) {
        const path = element.getAttribute('data-include');
        if (!path) continue;

        try {
            const response = await fetch(path);

            if (!response.ok) {
                throw new Error(`Ошибка загрузки компонента: ${path}`);
            }

            const html = await response.text();
            element.innerHTML = html;
        } catch (error) {
            console.error(error);
        }
    }
}

function initHeader() {
    const header = document.querySelector('.header');
    const burger = document.querySelector('.header__burger');
    const mobileMenu = document.querySelector('.mobile-menu');
    const overlay = document.querySelector('.mobile-menu-overlay');

    if (!header) return;

    function closeMenu() {
        if (burger) burger.classList.remove('active');
        if (mobileMenu) mobileMenu.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        document.body.classList.remove('menu-open');

        if (burger) {
            burger.setAttribute('aria-expanded', 'false');
        }
    }

    if (burger && mobileMenu && overlay) {
        burger.addEventListener('click', () => {
            burger.classList.toggle('active');
            mobileMenu.classList.toggle('active');
            overlay.classList.toggle('active');
            document.body.classList.toggle('menu-open');

            const expanded = burger.classList.contains('active');
            burger.setAttribute('aria-expanded', String(expanded));
        });

        overlay.addEventListener('click', closeMenu);

        mobileMenu.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', closeMenu);
        });
    }

    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.scrollY;

        header.classList.toggle('scrolled', currentScroll > 20);

        if (
            currentScroll > lastScroll &&
            currentScroll > 120 &&
            !document.body.classList.contains('menu-open')
        ) {
            header.classList.add('header--hidden');
        } else {
            header.classList.remove('header--hidden');
        }

        lastScroll = currentScroll;
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadComponents();
    initHeader();
});