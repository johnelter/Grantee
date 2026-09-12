document.addEventListener('DOMContentLoaded', async () => {

    // --- Theme Controller ---
    let themeTransitionTimer = null;

    function getStoredTheme() {
        return localStorage.getItem('grantee_theme') || localStorage.getItem('grantee_admin_theme') || 'light';
    }

    function applyTheme(theme, animate = false) {
        if (animate) {
            document.documentElement.classList.add('theme-transition');
            clearTimeout(themeTransitionTimer);
            themeTransitionTimer = setTimeout(() => {
                document.documentElement.classList.remove('theme-transition');
            }, 450);
        }

        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('grantee_theme', theme);
        localStorage.setItem('grantee_admin_theme', theme);

        document.querySelectorAll('#theme-toggle, .btn-theme-toggle').forEach(btn => {
            const iconClass = animate ? 'theme-icon-animate' : '';
            if (theme === 'dark') {
                btn.innerHTML = `<i data-lucide="sun" class="${iconClass}" style="color: #DCC8A3; width: 19px; height: 19px;"></i>`;
                btn.setAttribute('title', 'Switch to Light Mode');
                btn.setAttribute('aria-label', 'Switch to Light Mode');
            } else {
                btn.innerHTML = `<i data-lucide="moon" class="${iconClass}" style="color: #586F62; width: 19px; height: 19px;"></i>`;
                btn.setAttribute('title', 'Switch to Dark Mode');
                btn.setAttribute('aria-label', 'Switch to Dark Mode');
            }
        });

        if (window.lucide && lucide.createIcons) {
            try { lucide.createIcons(); } catch (e) {}
        }
    }

    // Initialize theme immediately without animation
    applyTheme(getStoredTheme(), false);

    // Theme Toggle Click Handler
    document.addEventListener('click', (e) => {
        const themeBtn = e.target.closest('#theme-toggle, .btn-theme-toggle');
        if (themeBtn) {
            e.preventDefault();
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(nextTheme, true);
        }
    });

    const schoolSelect = document.getElementById('school-select');
    const scholarshipsSection = document.getElementById('scholarships-section');
    const scholarshipGrid = document.getElementById('scholarship-grid');
    const selectedSchoolTitle = document.getElementById('selected-school-title');
    const navLinksContainer = document.getElementById('nav-links');
    const navLinks = document.querySelectorAll('.nav-links a');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const navbar = document.querySelector('.navbar');

    let isManualScrolling = false;
    let manualScrollTimer = null;

    // Render initial icons
    if (window.lucide) {
        lucide.createIcons();
    }

    // Helper: update active nav link
    function setActiveNavLink(sectionId) {
        navLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href === `#${sectionId}` || (sectionId === 'home-section' && (href === '#home-section' || href === '#'))) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    // Helper: smooth scroll to element with navbar offset to include the title
    function scrollToElementWithOffset(element) {
        if (!element) return;
        const navHeight = navbar ? navbar.offsetHeight : (window.innerWidth <= 768 ? 60 : 80);
        const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
        const offsetPadding = window.innerWidth <= 768 ? 10 : 16;
        const offsetPosition = Math.max(0, elementPosition - navHeight - offsetPadding);

        isManualScrolling = true;
        clearTimeout(manualScrollTimer);

        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
        });

        manualScrollTimer = setTimeout(() => {
            isManualScrolling = false;
        }, 800);
    }

    // --- Mobile Menu Drawer Controller ---
    function closeMobileMenu() {
        if (navLinksContainer && navLinksContainer.classList.contains('active-mobile')) {
            navLinksContainer.classList.remove('active-mobile');
            if (mobileMenuBtn) {
                mobileMenuBtn.setAttribute('aria-expanded', 'false');
                mobileMenuBtn.innerHTML = '<i data-lucide="menu"></i>';
                if (window.lucide) lucide.createIcons();
            }
        }
    }

    function toggleMobileMenu() {
        if (!navLinksContainer) return;
        const isOpen = navLinksContainer.classList.toggle('active-mobile');
        if (mobileMenuBtn) {
            mobileMenuBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            mobileMenuBtn.innerHTML = isOpen ? '<i data-lucide="x"></i>' : '<i data-lucide="menu"></i>';
            if (window.lucide) lucide.createIcons();
        }
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMobileMenu();
        });
    }

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (navLinksContainer && navLinksContainer.classList.contains('active-mobile')) {
            if (!navLinksContainer.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
                closeMobileMenu();
            }
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMobileMenu();
        }
    });

    // --- Tab Click Handlers ---
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (!href || !href.startsWith('#')) return;

            e.preventDefault();

            let targetId = href.substring(1);
            if (!targetId || targetId === 'home-section') {
                targetId = 'home-section';
            }

            let targetElement = document.getElementById(targetId);

            // Special handling for Scholarships if not yet unhidden
            if (targetId === 'scholarships-section') {
                if (scholarshipsSection && scholarshipsSection.classList.contains('hidden')) {
                    targetElement = document.querySelector('.school-selector-card') || document.getElementById('home-section');
                    if (schoolSelect) {
                        schoolSelect.focus();
                    }
                }
            }

            if (targetElement) {
                setActiveNavLink(targetId);
                scrollToElementWithOffset(targetElement);
            }

            // Always close mobile menu on selection
            closeMobileMenu();
        });
    });

    // Also handle all anchor links on the page (like footer links, feature links)
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        if (anchor.closest('.nav-links')) return; // already handled
        anchor.addEventListener('click', (e) => {
            const href = anchor.getAttribute('href');
            if (!href || href === '#') return;

            const targetId = href.substring(1);
            let targetElement = document.getElementById(targetId);

            if (targetId === 'scholarships-section' && scholarshipsSection && scholarshipsSection.classList.contains('hidden')) {
                targetElement = document.querySelector('.school-selector-card') || document.getElementById('home-section');
                if (schoolSelect) schoolSelect.focus();
            }

            if (targetElement) {
                e.preventDefault();
                setActiveNavLink(targetId);
                scrollToElementWithOffset(targetElement);
                closeMobileMenu();
            }
        });
    });

    // --- ScrollSpy: dynamically highlight active tab on scroll ---
    const sections = [
        { id: 'home-section', elem: document.getElementById('home-section') },
        { id: 'scholarships-section', elem: document.getElementById('scholarships-section') },
        { id: 'about-section', elem: document.getElementById('about-section') },
        { id: 'how-it-works', elem: document.getElementById('how-it-works') },
        { id: 'contact-section', elem: document.getElementById('contact-section') }
    ];

    window.addEventListener('scroll', () => {
        if (isManualScrolling) return;

        const scrollY = window.pageYOffset;
        const navHeight = navbar ? navbar.offsetHeight : 80;
        const triggerPoint = scrollY + navHeight + 100;

        // If at the very top, always activate Home
        if (scrollY < 200) {
            setActiveNavLink('home-section');
            return;
        }

        // Check if near bottom of page -> activate Contact
        if ((window.innerHeight + window.pageYOffset) >= document.body.offsetHeight - 80) {
            setActiveNavLink('contact-section');
            return;
        }

        // Find current section in view
        let currentSectionId = 'home-section';
        sections.forEach(({ id, elem }) => {
            if (elem && !elem.classList.contains('hidden')) {
                const top = elem.offsetTop;
                const height = elem.offsetHeight;
                if (triggerPoint >= top && triggerPoint < top + height) {
                    currentSectionId = id;
                }
            }
        });

        setActiveNavLink(currentSectionId);
    }, { passive: true });


    // --- Helper: Category Badge Component ---
    function getCategoryBadgeHTML(category) {
        const raw = (category || 'Educational Assistance').trim();
        const catLower = raw.toLowerCase();
        let badgeClass = 'category-default';
        let iconName = 'award';

        if (catLower.includes('institution')) {
            badgeClass = 'category-institution';
            iconName = 'building-2';
        } else if (catLower.includes('ched')) {
            badgeClass = 'category-ched';
            iconName = 'landmark';
        } else if (catLower.includes('private')) {
            badgeClass = 'category-private';
            iconName = 'briefcase';
        } else if (catLower.includes('government') || catLower.includes('gov')) {
            badgeClass = 'category-government';
            iconName = 'shield-check';
        }

        return `
            <span class="sch-category-badge ${badgeClass}">
                <i data-lucide="${iconName}"></i>
                <span>${raw}</span>
            </span>
        `;
    }

    // --- 1. FETCH ACTUAL SCHOOL RECORDS FROM DATABASE ---
    async function loadSchools() {
        try {
            if (!window.supabaseClient) {
                console.warn("Supabase client not initialized.");
                return;
            }

            const { data: schools, error } = await window.supabaseClient
                .from('schools')
                .select('id, name')
                .order('name', { ascending: true });

            if (error) throw error;

            if (schools && schools.length > 0) {
                schools.forEach(school => {
                    const option = document.createElement('option');
                    option.value = school.id; 
                    option.textContent = school.name; 
                    schoolSelect.appendChild(option);
                });
            } else {
                schoolSelect.innerHTML = '<option disabled selected>No schools available</option>';
            }

        } catch (err) {
            console.error("Error fetching schools list:", err);
            schoolSelect.innerHTML = '<option disabled selected>Failed to load schools</option>';
        }
    }

    // --- Helper: Render Realistic Skeleton Loading Cards ---
    function renderSkeletonCards(count = 3) {
        let skeletonsHTML = '';
        for (let i = 0; i < count; i++) {
            skeletonsHTML += `
                <div class="sch-card sch-skeleton-card" aria-hidden="true">
                    <!-- Top Row: Category & Status / Slots -->
                    <div class="sch-card-top" style="display: flex; justify-content: space-between; align-items: center;">
                        <div class="skeleton-shimmer" style="width: 105px; height: 22px; border-radius: 9999px;"></div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <div class="skeleton-shimmer" style="width: 58px; height: 20px; border-radius: 9999px;"></div>
                            <div class="skeleton-shimmer" style="width: 90px; height: 20px; border-radius: 9999px;"></div>
                        </div>
                    </div>

                    <!-- Header: Title Icon + Title & Department Lines -->
                    <div class="sch-card-header" style="display: flex; gap: 14px; align-items: flex-start;">
                        <div class="skeleton-shimmer" style="width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0;"></div>
                        <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
                            <div class="skeleton-shimmer" style="width: 82%; height: 18px; border-radius: 6px;"></div>
                            <div class="skeleton-shimmer" style="width: 48%; height: 13px; border-radius: 4px;"></div>
                        </div>
                    </div>

                    <!-- Criteria Specs Grid (2 items) -->
                    <div class="sch-specs-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 14px;">
                        <div class="sch-spec-item" style="display: flex; flex-direction: column; gap: 8px; padding: 10px 12px;">
                            <div class="skeleton-shimmer" style="width: 65px; height: 11px; border-radius: 4px;"></div>
                            <div class="skeleton-shimmer" style="width: 85px; height: 15px; border-radius: 5px;"></div>
                        </div>
                        <div class="sch-spec-item" style="display: flex; flex-direction: column; gap: 8px; padding: 10px 12px;">
                            <div class="skeleton-shimmer" style="width: 75px; height: 11px; border-radius: 4px;"></div>
                            <div class="skeleton-shimmer" style="width: 100px; height: 15px; border-radius: 5px;"></div>
                        </div>
                    </div>

                    <!-- Accordion Box Placeholder -->
                    <div class="sch-accordion-area" style="padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div class="skeleton-shimmer" style="width: 16px; height: 16px; border-radius: 4px;"></div>
                            <div class="skeleton-shimmer" style="width: 125px; height: 14px; border-radius: 4px;"></div>
                        </div>
                        <div class="skeleton-shimmer" style="width: 78px; height: 20px; border-radius: 9999px;"></div>
                    </div>

                    <!-- Footnote Notice Placeholder -->
                    <div class="sch-card-footer-notice" style="display: flex; align-items: center; gap: 8px; padding-top: 10px; margin-top: auto;">
                        <div class="skeleton-shimmer" style="width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0;"></div>
                        <div class="skeleton-shimmer" style="width: 75%; height: 12px; border-radius: 4px;"></div>
                    </div>
                </div>
            `;
        }
        return skeletonsHTML;
    }

    // --- 2. FETCH SCHOLARSHIPS ISOLATED BY SCHOOL ID ---
    async function fetchScholarshipsBySchool(schoolId) {
        try {
            // Render skeleton cards immediately while fetching
            scholarshipGrid.innerHTML = renderSkeletonCards(3);
            
            const { data: scholarships, error } = await window.supabaseClient
                .from('scholarships')
                .select('*')
                .eq('status', 'Active')
                .eq('school_id', schoolId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            scholarshipGrid.innerHTML = '';

            if (!scholarships || scholarships.length === 0) {
                scholarshipGrid.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 56px 24px; background: var(--card-bg); border-radius: 20px; border: 1.5px dashed var(--border-color); box-shadow: var(--shadow-sm);">
                        <div style="width: 56px; height: 56px; background: var(--card-bg-secondary); color: var(--moss-green); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                            <i data-lucide="inbox" style="width: 28px; height: 28px;"></i>
                        </div>
                        <h4 style="color: var(--text-heading); font-size: 18px; font-weight: 700; margin-bottom: 8px;">No Active Educational Assistance Found</h4>
                        <p style="color: var(--text-muted); font-size: 14.5px; margin: 0 auto; max-width: 440px; line-height: 1.6;">There are currently no open educational assistance listings for this institution. Please check back regularly for updates.</p>
                    </div>
                `;
                if (window.lucide) lucide.createIcons();
                return;
            }

            scholarships.forEach((sch, index) => {
                // 1. Calculate dynamic Open / Closed / Upcoming status based on application deadline & dates
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                let dynamicStatus = 'Open';
                let isClosed = false;
                let isUpcoming = false;

                if (sch.status === 'Closed') {
                    dynamicStatus = 'Closed';
                    isClosed = true;
                } else {
                    if (sch.start_date) {
                        const startDate = new Date(sch.start_date);
                        startDate.setHours(0, 0, 0, 0);
                        if (today < startDate) {
                            dynamicStatus = 'Upcoming';
                            isUpcoming = true;
                        }
                    }
                    
                    if (sch.end_date && !isUpcoming) {
                        const endDate = new Date(sch.end_date);
                        endDate.setHours(23, 59, 59, 999);
                        if (today > endDate) {
                            dynamicStatus = 'Closed';
                            isClosed = true;
                        }
                    }
                }

                // Generate Top Status Badge HTML
                let statusBadgeHTML = '';
                if (isClosed) {
                    statusBadgeHTML = `<span class="sch-status-badge status-closed"><i data-lucide="lock"></i> Closed</span>`;
                } else if (isUpcoming) {
                    statusBadgeHTML = `<span class="sch-status-badge status-upcoming"><i data-lucide="clock"></i> Opening Soon</span>`;
                } else {
                    statusBadgeHTML = `<span class="sch-status-badge status-open"><i data-lucide="check-circle-2"></i> Open</span>`;
                }

                // 2. Min GWA requirement
                let gwaDisplay = 'Open to all';
                if (sch.eligibility_rules?.gwa?.enabled && sch.eligibility_rules.gwa.minimum) {
                    gwaDisplay = `Min. GWA ${sch.eligibility_rules.gwa.minimum}`;
                } else if (sch.gwa_requirement || sch.min_gwa) {
                    gwaDisplay = `Min. GWA ${sch.gwa_requirement || sch.min_gwa}`;
                }

                // 3. Application Deadline formatted
                let deadlineDisplay = 'No Deadline';
                if (sch.end_date) {
                    const d = new Date(sch.end_date);
                    if (!isNaN(d.getTime())) {
                        deadlineDisplay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    }
                }

                // 4. Available Slots
                let slotsText = 'Slots Vary';
                if (sch.slots === 'Open' || sch.available_slots === 'Unlimited') {
                    slotsText = 'Open / Unlimited';
                } else if (sch.available_slots !== undefined && sch.available_slots !== null) {
                    slotsText = `${sch.available_slots} Slots Available`;
                }

                // 5. Description handling
                const rawDescription = sch.description 
                    ? sch.description.replace(/<[^>]*>?/gm, '').trim() 
                    : 'Open for student applications meeting the institutional criteria.';

                const isLong = rawDescription.length > 125;
                const shortDescription = isLong ? rawDescription.substring(0, 120) + '...' : rawDescription;
                const descId = `desc-${sch.id || index}`;

                // 6. Department / School Year tag
                const deptText = sch.department || sch.school_year || '';

                const card = document.createElement('div');
                card.className = `sch-card ${isClosed ? 'card-closed' : ''}`;
                card.innerHTML = `
                    <!-- Top Category, Status & Slots -->
                    <div class="sch-card-top">
                        ${getCategoryBadgeHTML(sch.category)}
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            ${statusBadgeHTML}
                            <span class="sch-slots-badge">
                                <i data-lucide="users"></i>
                                <span>${slotsText}</span>
                            </span>
                        </div>
                    </div>

                    <!-- Program Title & Dept -->
                    <div class="sch-card-header">
                        <div class="sch-title-icon">
                            <i data-lucide="graduation-cap"></i>
                        </div>
                        <div class="sch-title-info">
                            <h3 class="sch-title">${sch.title}</h3>
                            ${deptText ? `
                                <span class="sch-dept">
                                    <i data-lucide="building-2"></i> ${deptText}
                                </span>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Quick Specs Grid (GWA & Deadline with Open/Closed Tag) -->
                    <div class="sch-specs-grid">
                        <div class="sch-spec-item">
                            <span class="spec-label"><i data-lucide="award"></i> Min. Grade (GWA)</span>
                            <span class="spec-value" title="${gwaDisplay}">${gwaDisplay}</span>
                        </div>
                        <div class="sch-spec-item">
                            <span class="spec-label"><i data-lucide="calendar"></i> Application Deadline</span>
                            <span class="spec-value" title="${deadlineDisplay}">
                                ${deadlineDisplay}
                                <span class="deadline-status-pill ${isClosed ? 'pill-closed' : (isUpcoming ? 'pill-upcoming' : 'pill-open')}">
                                    ${dynamicStatus.toUpperCase()}
                                </span>
                            </span>
                        </div>
                    </div>

                    <!-- Collapsible "About This Assistance" Accordion -->
                    <div class="sch-accordion-area">
                        <button type="button" class="btn-accordion-toggle" data-target="${descId}" aria-expanded="false" aria-controls="${descId}">
                            <span class="accordion-title-wrap">
                                <i data-lucide="file-text"></i>
                                <span>About This Assistance</span>
                            </span>
                            <span class="accordion-status-pill">
                                <span class="accordion-action-text">Show Details</span>
                                <i data-lucide="chevron-down" class="accordion-arrow"></i>
                            </span>
                        </button>
                        <div class="sch-desc-collapse" id="${descId}">
                            <div class="sch-desc-inner">
                                <p class="sch-desc-text">${rawDescription}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Helpful Footnote Notice -->
                    <div class="sch-card-footer-notice">
                        <i data-lucide="info"></i>
                        <span>Log in or register to submit an application for this assistance program.</span>
                    </div>
                `;

                // Handle Accordion Toggle (Hide / Show Description)
                const accordionToggleBtn = card.querySelector('.btn-accordion-toggle');
                if (accordionToggleBtn) {
                    accordionToggleBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        const isExpanded = accordionToggleBtn.getAttribute('aria-expanded') === 'true';
                        const targetCollapse = card.querySelector(`#${descId}`);
                        const accordionArea = card.querySelector('.sch-accordion-area');

                        if (isExpanded) {
                            targetCollapse.classList.remove('open');
                            if (accordionArea) accordionArea.classList.remove('is-expanded');
                            accordionToggleBtn.setAttribute('aria-expanded', 'false');
                            accordionToggleBtn.innerHTML = `
                                <span class="accordion-title-wrap">
                                    <i data-lucide="file-text"></i>
                                    <span>About This Assistance</span>
                                </span>
                                <span class="accordion-status-pill">
                                    <span class="accordion-action-text">Show Details</span>
                                    <i data-lucide="chevron-down" class="accordion-arrow"></i>
                                </span>
                            `;
                        } else {
                            targetCollapse.classList.add('open');
                            if (accordionArea) accordionArea.classList.add('is-expanded');
                            accordionToggleBtn.setAttribute('aria-expanded', 'true');
                            accordionToggleBtn.innerHTML = `
                                <span class="accordion-title-wrap">
                                    <i data-lucide="file-text"></i>
                                    <span>About This Assistance</span>
                                </span>
                                <span class="accordion-status-pill">
                                    <span class="accordion-action-text">Hide Details</span>
                                    <i data-lucide="chevron-up" class="accordion-arrow"></i>
                                </span>
                            `;
                        }

                        if (window.lucide) {
                            lucide.createIcons();
                        }
                    });
                }

                scholarshipGrid.appendChild(card);
            });

            if (window.lucide) {
                lucide.createIcons();
            }

        } catch (err) {
            console.error("Error fetching matching scholarships:", err);
            scholarshipGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px 24px; background: var(--card-bg-secondary); border-radius: 16px; border: 1px solid var(--status-closed-border); color: var(--status-closed-color);">
                    <p style="margin: 0; font-size: 14.5px; font-weight: 600;">Failed to load available educational assistance. Please check your connection.</p>
                </div>
            `;
        }
    }

    // --- 3. SELECTION EVENT HANDLER ---
    if (schoolSelect) {
        schoolSelect.addEventListener('change', (e) => {
            const schoolId = e.target.value;
            const schoolName = schoolSelect.options[schoolSelect.selectedIndex].text;
            
            if (schoolId) {
                localStorage.setItem('granteeSelectedSchoolId', schoolId);
                localStorage.setItem('granteeSelectedSchool', schoolName);
                
                if (scholarshipsSection) scholarshipsSection.classList.remove('hidden');
                if (selectedSchoolTitle) selectedSchoolTitle.innerText = `Educational Assistance at ${schoolName}`;

                fetchScholarshipsBySchool(schoolId);
                
                // Smoothly scroll to the section with title in view
                scrollToElementWithOffset(scholarshipsSection);
                setActiveNavLink('scholarships-section');
            }
        });
    }

    // Boot
    loadSchools();
});