const setupRevealEffects = () => {
  const revealElements = () => document.querySelectorAll('.reveal:not(.show)');

  if (!('IntersectionObserver' in window)) {
    revealElements().forEach((el) => el.classList.add('show'));
    return () => {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('show');
          io.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.2,
    }
  );

  return () => {
    revealElements().forEach((el) => {
      if (!el.closest('[hidden]')) {
        io.observe(el);
      }
    });
  };
};

const tabLinks = document.querySelectorAll('[data-tab-target]');
const tabPanels = document.querySelectorAll('[data-tab-panel]');
const observeVisibleReveals = setupRevealEffects();

const getTabFromHash = () => {
  const tabName = window.location.hash.replace(/^#/, '');
  return document.querySelector(`[data-tab-panel="${tabName}"]`) ? tabName : 'resume';
};

const activateTab = (tabName, updateHash = true) => {
  const selectedPanel = document.querySelector(`[data-tab-panel="${tabName}"]`);
  if (!selectedPanel) return;

  tabLinks.forEach((link) => {
    const isActive = link.dataset.tabTarget === tabName;
    link.classList.toggle('is-active', isActive);
    link.setAttribute('aria-selected', String(isActive));
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.tabPanel === tabName;
    panel.classList.toggle('is-active', isActive);
    panel.hidden = !isActive;
  });

  if (updateHash && window.location.hash !== `#${tabName}`) {
    history.pushState(null, '', `#${tabName}`);
  }

  observeVisibleReveals();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

tabLinks.forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    activateTab(link.dataset.tabTarget);
  });
});

window.addEventListener('hashchange', () => {
  activateTab(getTabFromHash(), false);
});

activateTab(getTabFromHash(), false);

for (const anchor of document.querySelectorAll('a[href^="#"]:not([data-tab-target])')) {
  anchor.addEventListener('click', (event) => {
    const href = anchor.getAttribute('href');
    if (!href || href === '#') return;

    const target = document.querySelector(href);
    if (!target) return;

    if (target.matches('[data-tab-panel]')) {
      event.preventDefault();
      activateTab(target.dataset.tabPanel);
      return;
    }

    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
