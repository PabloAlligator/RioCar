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

    updateHeaderOnScroll();

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

// скролл
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

// фильтры

function initTravelFilters() {
    const filters = document.querySelectorAll('.travel-filter');
    const cards = Array.from(document.querySelectorAll('.travel-card'));

    if (!filters.length || !cards.length || typeof gsap === 'undefined') return;

    let isAnimating = false;

    filters.forEach((btn) => {
        btn.addEventListener('click', () => {
            if (isAnimating) return;

            const filter = btn.dataset.filter;

            filters.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');

            const showCards = [];
            const hideCards = [];

            cards.forEach((card) => {
                const categories = (card.dataset.category || '')
                    .split(' ')
                    .map((item) => item.trim())
                    .filter(Boolean);

                const isVisible = filter === 'all' || categories.includes(filter);
                const isCurrentlyHidden = getComputedStyle(card).display === 'none';

                if (isVisible) {
                    showCards.push(card);
                } else if (!isCurrentlyHidden) {
                    hideCards.push(card);
                }
            });

            isAnimating = true;

            const tl = gsap.timeline({
                defaults: { ease: 'power2.out' },
                onComplete: () => {
                    isAnimating = false;
                }
            });

            if (hideCards.length) {
                tl.to(hideCards, {
                    opacity: 0,
                    y: 18,
                    scale: 0.985,
                    duration: 0.22,
                    stagger: 0.04,
                    onComplete: () => {
                        hideCards.forEach((card) => {
                            card.style.display = 'none';
                        });
                    }
                });
            }

            tl.add(() => {
                showCards.forEach((card) => {
                    const hidden = getComputedStyle(card).display === 'none';

                    if (hidden) {
                        card.style.display = '';
                        gsap.set(card, {
                            opacity: 0,
                            y: 18,
                            scale: 0.985
                        });
                    }
                });
            });

            const isAll = filter === 'all';
            tl.to(showCards, {
                opacity: 1,
                y: 0,
                scale: isAll ? 1 : 1,
                duration: isAll ? 0.45 : 0.3,
                stagger: isAll ? 0.08 : 0.04,
                ease: isAll ? 'power3.out' : 'power2.out',
                clearProps: 'transform,opacity'
            });
        });
    });
}



document.addEventListener('DOMContentLoaded', () => {
    initHeader();
    initSmoothScroll();
    initTravelFilters();
});