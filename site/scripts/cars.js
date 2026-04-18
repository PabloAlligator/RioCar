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
            setMenuState(!burger.classList.contains('active'));
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

function initCarsFilter() {
    const filters = document.querySelectorAll('.cars-filter');
    const cards = document.querySelectorAll('.cars-card');

    if (!filters.length || !cards.length) return;

    filters.forEach((btn) => {
        btn.addEventListener('click', () => {
            const filter = btn.dataset.filter;

            filters.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');

            cards.forEach((card) => {
                const category = card.dataset.category;

                if (filter === 'all' || category === filter) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });
}

function initCarsModal() {
    const cards = document.querySelectorAll('.cars-card');
    const modal = document.getElementById('carsModal');

    if (!cards.length || !modal) return;

    const modalTitle = document.getElementById('carsModalTitle');
    const modalPrice = document.getElementById('carsModalPrice');
    const modalYear = document.getElementById('carsModalYear');
    const modalEngine = document.getElementById('carsModalEngine');
    const modalMileage = document.getElementById('carsModalMileage');
    const modalDrive = document.getElementById('carsModalDrive');
    const modalGearbox = document.getElementById('carsModalGearbox');
    const modalPhoto = document.getElementById('carsModalPhoto');
    const modalBadge = document.getElementById('carsModalBadge');
    const modalComplectation = document.getElementById('carsModalComplectation');

    const closeBtn = modal.querySelector('.cars-card__modal-close');
    const modalOverlay = modal.querySelector('.cars-card__modal-overlay');

    const closeModal = () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    };

    cards.forEach((card) => {
        card.addEventListener('click', () => {
            if (modalTitle) modalTitle.textContent = card.dataset.title || '';
            if (modalPrice) modalPrice.textContent = card.dataset.price || '';
            if (modalYear) modalYear.textContent = card.dataset.year || '';
            if (modalEngine) modalEngine.textContent = card.dataset.engine || '';
            if (modalMileage) modalMileage.textContent = card.dataset.mileage || '';
            if (modalDrive) modalDrive.textContent = card.dataset.drive || '';
            if (modalGearbox) modalGearbox.textContent = card.dataset.gearbox || '';
            if (modalBadge) modalBadge.textContent = card.dataset.badge || '';
            if (modalComplectation) modalComplectation.textContent = card.dataset.complectation || '';

            if (modalPhoto) {
                modalPhoto.src = card.dataset.image || '';
                modalPhoto.alt = card.dataset.title || 'Автомобиль';
            }

            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', closeModal);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initHeader();
    initSmoothScroll();
    initCarsFilter();
    initCarsModal();
});