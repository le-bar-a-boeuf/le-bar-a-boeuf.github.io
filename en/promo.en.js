// js/promo.js — bulle flottante (tête de cochon), ré-affichée à chaque refresh

(function () {
  // Détecte la page: via data-page OU via l'URL (fallback)
  const path = location.pathname.replace(/\/+$/, "/"); // normalise le trailing slash
  const lang = path.startsWith("/en/") ? "en" : "fr";

  // vrai si on est sur la page boucherie
  const isButchery =
    (document.body.dataset.page === "producteurs") ||
    /\/ferme-preney\/(?:index\.html)?$/.test(path) ||
    /\/en\/preney-farm\/(?:index\.html)?$/.test(path);

  // vrai si on est sur l'accueil restaurant
  const isRestaurant =
    (document.body.dataset.page === "restaurant") ||
    (!isButchery && (
      path === "/" || path === "../index.html" ||
      path === "/en/" || path === "../en/index.html"
    ));

  let content = null;

  if (isRestaurant) {
    // Sur la page restaurant → pousser vers la boucherie
    content = {
      title: (lang === "en") ? "Farm shop" : "Farm shop",
      text:  (lang === "en") ? "🐷 Buy our organic meat.\nClick me!" : "🐷 Buy our organic meat.\nClick me!",
      cta:   { href: (lang === "en") ? "./preney-farm/index.html" : "./preney-farm/index.html" }
    };
  } else if (isButchery) {
    // Sur la boucherie → pousser vers le restaurant
    content = {
      title: (lang === "en") ? "Our restaurant!" : "Our restaurant!",
      text:  (lang === "en") ? "🐷 We also cook.\nClick me!" : "🐷 We also cook.\nClick me!",
      cta:   { href: (lang === "en") ? "../index.html" : "../index.html" }
    };
  } else {
    return; // autres pages : rien
  }

  // ===== Composant bulle (tête de cochon) =====
  function createPigBubble(content) {
    const el = document.createElement('aside');
    el.className = 'promo-bubble pig';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('tabindex', '0');

    el.innerHTML = `
        <button class="promo-close" aria-label="Fermer">×</button>

        <div class="inner">
            <h4 class="title">${content.title}</h4>
            <h4 class="title" style="padding-top: 15px">${content.text}</h4>
        </div>

        <!-- oreilles -->
        <span class="ear left"  aria-hidden="true"></span>
        <span class="ear right" aria-hidden="true"></span>

        <!-- yeux -->
        <span class="eye left"  aria-hidden="true"><span class="pupil"></span></span>
        <span class="eye right" aria-hidden="true"><span class="pupil"></span></span>

        <!-- groin -->
        <span class="snout" aria-hidden="true">
            <span class="nostril"></span><span class="nostril"></span>
        </span>
        `;


    // Ferme UNIQUEMENT cette bulle
    el.querySelector('.promo-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      el.classList.add('hide');
      setTimeout(() => el.remove(), 220);
    });

    // Clic sur la bulle => redirection (sauf croix)
    el.addEventListener('click', (e) => {
      if (e.target.closest('.promo-close')) return;
      window.location.href = content.cta.href;
    });

    // Accessibilité clavier
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.location.href = content.cta.href;
      }
    });

    document.body.appendChild(el);
    return el;
  }

  // === Appel effectif (c’était manquant) ===
  createPigBubble(content);
})();
