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