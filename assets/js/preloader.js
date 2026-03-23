(function() {
    const PRELOADER_DURATION = 3000; // ms, configurable
    const TRANSITION_DURATION = 1000; // ms, configurable

    window.addEventListener('load', () => {
        const preloader = document.getElementById('preloader');
        const preloaderLogo = document.getElementById('preloader-logo');
        const navbarLogo = document.querySelector('.navbar-brand.logo .block-img');

        if (!preloader || !preloaderLogo) return; // if no preloader, exit

        setTimeout(() => {
            // Stop breathing animation
            preloaderLogo.style.animation = 'none';

            // Capture current logo position
            const preRect = preloaderLogo.getBoundingClientRect();
            preloaderLogo.style.position = 'fixed';
            preloaderLogo.style.left = preRect.left + 'px';
            preloaderLogo.style.top = preRect.top + 'px';
            preloaderLogo.style.width = preRect.width + 'px';
            preloaderLogo.style.height = preRect.height + 'px';
            preloaderLogo.style.zIndex = '10000';

            // Force reflow
            void preloaderLogo.offsetWidth;

            // Check if navbar logo exists
            if (navbarLogo) {
                const navRect = navbarLogo.getBoundingClientRect();

                // Animate logo to navbar
                preloaderLogo.style.transition = `all ${TRANSITION_DURATION}ms cubic-bezier(0.65, 0, 0.35, 1)`;
                preloaderLogo.style.left = navRect.left + 'px';
                preloaderLogo.style.top = navRect.top + 'px';
                preloaderLogo.style.width = navRect.width + 'px';
                preloaderLogo.style.height = navRect.height + 'px';
            } else {
                // If no navbar logo, just shrink logo slightly
                preloaderLogo.style.transition = `all ${TRANSITION_DURATION}ms ease-in-out`;
                preloaderLogo.style.transform = 'scale(0.5)';
                preloaderLogo.style.opacity = '0';
            }

            // Fade out overlay
            preloader.style.transition = `opacity ${TRANSITION_DURATION}ms ease-in-out, background 0.5s ease-in-out`;
            preloader.style.opacity = 0;

            // Remove preloader after transition
            preloaderLogo.addEventListener('transitionend', () => {
                preloader.style.display = 'none';
            }, { once: true });

            // Optional: adjust glow based on theme
            const currentTheme = document.documentElement.getAttribute('data-theme');
            preloaderLogo.style.filter = `drop-shadow(0 0 15px var(--logo-shadow-color))`;
            if (currentTheme === 'dark') {
                preloaderLogo.style.filter = `drop-shadow(0 0 25px var(--logo-shadow-color))`;
            }

        }, PRELOADER_DURATION);
    });
})();