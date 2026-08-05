document.addEventListener('DOMContentLoaded', () => {
  const navLinks = Array.from(document.querySelectorAll('.nav a'));
  const sections = navLinks
    .map(link => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  if (sections.length) {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          const id = entry.target.getAttribute('id');
          const activeLink = navLinks.find(link => link.getAttribute('href') === `#${id}`);
          if (activeLink) {
            activeLink.classList.toggle('active', entry.isIntersecting);
          }
        });
      },
      { threshold: 0.4 }
    );

    sections.forEach(section => observer.observe(section));
  }

  const copyButton = document.getElementById('copy-email');
  const statusEl = document.getElementById('copy-status');

  const showStatus = message => {
    if (!statusEl) return;
    statusEl.textContent = message;
    setTimeout(() => (statusEl.textContent = ''), 2500);
  };

  const copyEmail = async () => {
    if (!copyButton) return;
    const email = copyButton.dataset.copy;
    if (!email) return;

    try {
      await navigator.clipboard.writeText(email);
      showStatus('Email copied to clipboard');
    } catch (err) {
      const input = document.createElement('input');
      input.value = email;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      showStatus('Email copied');
    }
  };

  copyButton?.addEventListener('click', copyEmail);

  const fallbackGlobe2D = (canvas, { animate = true, speed = 0.0025 } = {}) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = { angle: 0, w: 0, h: 0, stop: false };
    let frameId = null;

    const draw = () => {
      const { w, h } = state;
      ctx.clearRect(0, 0, w, h);

      const radius = Math.min(w, h) * 0.08;
      const cx = w * 0.5;
      const cy = h * 0.55;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(state.angle);
      ctx.strokeStyle = 'rgba(111, 227, 142, 0.94)';
      ctx.lineWidth = 2.6;

      for (let i = 0; i < 18; i++) {
        const theta = (Math.PI * 2 * i) / 18;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, radius * 0.12, theta, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (let j = -6; j <= 6; j++) {
        const phi = (Math.PI * j) / 12;
        const y = radius * Math.sin(phi);
        const r = Math.max(radius * Math.cos(phi), 6);
        ctx.beginPath();
        ctx.ellipse(0, y, r, Math.max(r * 0.18, 1), 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
      if (animate) {
        state.angle += speed;
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state.w = w;
      state.h = h;
      if (!animate) {
        draw();
      }
    };

    resize();
    window.addEventListener('resize', resize);

    const render = () => {
      if (state.stop) return;
      draw();
      if (animate) {
        frameId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      state.stop = true;
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      window.removeEventListener('resize', resize);
    };
  };

  const initGlobe = () => {
    const canvasWebGL = document.getElementById('globe-webgl');
    const canvasFallback = document.getElementById('globe-fallback');
    if (!canvasWebGL || !canvasFallback) {
      console.warn('Globe canvases not found.');
      return;
    }

    let stopFallback = null;
    const spinSpeed = prefersReducedMotion ? 0.0011 : 0.0032;
    const fallbackSpeed = prefersReducedMotion ? 0.001 : 0.0025;
    // Start fallback immediately so something is visible.
    stopFallback = fallbackGlobe2D(canvasFallback, { animate: true, speed: fallbackSpeed });
    canvasFallback.style.display = 'block';

    const useFallback = () => {
      canvasWebGL.style.display = 'none';
      canvasFallback.style.display = 'block';
      if (!stopFallback) {
        stopFallback = fallbackGlobe2D(canvasFallback, { animate: true, speed: fallbackSpeed });
      }
    };

    if (!window.THREE) {
      console.warn('Three.js not available; using 2D fallback.');
      useFallback();
      return;
    }

    try {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.z = 130;

      const renderer = new THREE.WebGLRenderer({ canvas: canvasWebGL, alpha: true, antialias: true });
      const gl = renderer.getContext();
      if (!gl) {
        console.warn('WebGL context unavailable; using 2D fallback.');
        useFallback();
        return;
      }

      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);

      const ambient = new THREE.AmbientLight(0xffffff, 0.05);
      scene.add(ambient);

      const globeGroup = new THREE.Group();
      const tilt = THREE.MathUtils ? THREE.MathUtils.degToRad(23.5) : (23.5 * Math.PI) / 180;
      globeGroup.rotation.z = tilt;
      scene.add(globeGroup);

      const radius = 20;
      const meridians = 18;
      const parallels = 8;
      const latSegments = 96;
      const ringSegments = 128;

      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x6fe38e,
        transparent: true,
        opacity: 0.94,
        blending: THREE.AdditiveBlending
      });

      const glowMaterial = new THREE.LineBasicMaterial({
        color: 0x9fffc6,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
      });

      const addMeridian = angle => {
        const positions = [];
        for (let j = 0; j <= latSegments; j++) {
          const v = -Math.PI / 2 + (j / latSegments) * Math.PI;
          const x = radius * Math.cos(v) * Math.cos(angle);
          const y = radius * Math.sin(v);
          const z = radius * Math.cos(v) * Math.sin(angle);
          positions.push(x, y, z);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const line = new THREE.Line(geo, lineMaterial);
        globeGroup.add(line);

        const glowLine = line.clone();
        glowLine.material = glowMaterial;
        glowLine.scale.set(1.01, 1.01, 1.01);
        globeGroup.add(glowLine);
      };

      const addParallel = phi => {
        const y = radius * Math.sin(phi);
        const r = radius * Math.cos(phi);
        const positions = [];
        for (let s = 0; s <= ringSegments; s++) {
          const theta = (s / ringSegments) * Math.PI * 2;
          positions.push(r * Math.cos(theta), y, r * Math.sin(theta));
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const loop = new THREE.LineLoop(geo, lineMaterial);
        globeGroup.add(loop);

        const glowLoop = loop.clone();
        glowLoop.material = glowMaterial;
        glowLoop.scale.set(1.01, 1.01, 1.01);
        globeGroup.add(glowLoop);
      };

      for (let i = 0; i < meridians; i++) {
        const angle = (i / meridians) * Math.PI * 2;
        addMeridian(angle);
      }

      for (let k = 1; k <= parallels; k++) {
        const phi = -Math.PI / 2 + (k / (parallels + 1)) * Math.PI;
        addParallel(phi);
      }

      canvasWebGL.style.display = 'block';
      canvasFallback.style.display = 'none';
      if (stopFallback) {
        stopFallback();
        stopFallback = null;
      }

      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };

      window.addEventListener('resize', onResize);

      const renderFrame = () => {
        globeGroup.rotation.y += spinSpeed;
        renderer.render(scene, camera);
        requestAnimationFrame(renderFrame);
      };

      renderFrame();
    } catch (err) {
      console.warn('Three.js failed; falling back to 2D globe.', err);
      useFallback();
    }
  };

  initGlobe();

  // Project data
  const projectData = {
    'ops-system': {
      title: 'Internal Operations Platform (2025–present)',
      status: 'done',
      tag: 'Product & Full Stack',
      content: `
        <h4>The problem</h4>
        <p>Customer and project work was fragmented across Excel, email, file storage, and individual memory. Trello became a useful temporary bridge while the real workflow was mapped, but the team needed a secure shared system of record.</p>

        <h4>What I delivered</h4>
        <ul>
          <li>A production TypeScript, React, and Next.js application running server-side on Node.js</li>
          <li>PostgreSQL-backed customer, project, requirement, document, agreement, and activity workflows</li>
          <li>Authentication, role-aware access, private files, PDF generation, transactional email, and traceable history</li>
          <li>Database changes, releases, deployment verification, incident diagnosis, and continued user support</li>
        </ul>

        <h4>Measured scope</h4>
        <p>The platform supports 60+ customer cases, 280 tracked requirements, and 360+ traceable activities. Compared with the previous workflow, it saves an estimated 20–25 team hours per month in coordination and information retrieval.</p>

        <p><em>Employer-sensitive implementation details, customer data, and internal screens are intentionally not published.</em></p>
      `
    },
    'independent-game': {
      title: 'Independent PvP Arena Game',
      status: 'in-progress',
      tag: 'Game Development',
      content: `
        <p>An independently developed multiplayer PvP arena game in Godot, built as a long-term systems, design, and content project.</p>

        <h4>What I am building and learning</h4>
        <ul>
          <li>Multiplayer combat, player state, abilities, cooldowns, and readable hit feedback</li>
          <li>Character and creature iteration, animation integration, equipment, and visual identity</li>
          <li>Arena and world spaces, developer tooling, debugging, and regression verification</li>
        </ul>

        <div class="project-gallery" aria-label="PvP arena game development screenshots">
          <div class="gallery-carousel">
            <div class="carousel-track" id="game-gallery-track">
              <figure class="carousel-item">
                <div class="carousel-image-stage">
                  <img src="assets/game/independent-pvp-combat.png" alt="Third-person fantasy arena fight with a red cone-shaped attack telegraph, floating damage numbers, health and mana bars, and ability cooldown icons." loading="lazy" decoding="async">
                </div>
                <figcaption><strong>Combat systems</strong> - directional attack telegraphs, damage feedback, cooldowns, and player status UI during an arena encounter.</figcaption>
              </figure>
              <figure class="carousel-item" hidden aria-hidden="true">
                <div class="carousel-image-stage">
                  <img src="assets/game/independent-arena-environment.png" alt="Foggy elevated landscape with tree-covered plateaus, a narrow bridge, cliffs, and a stone archway." loading="lazy" decoding="async">
                </div>
                <figcaption><strong>Environment iteration</strong> - connected arena spaces, traversal landmarks, and atmospheric depth.</figcaption>
              </figure>
              <figure class="carousel-item" hidden aria-hidden="true">
                <div class="carousel-image-stage">
                  <img src="assets/game/independent-character-animation.png" alt="Two armored fantasy characters in a forest clearing, one raising an oversized sword while the other faces the camera." loading="lazy" decoding="async">
                </div>
                <figcaption><strong>Character iteration</strong> - equipment, silhouettes, and combat animation in a shared arena scene.</figcaption>
              </figure>
            </div>

            <div class="carousel-thumbs" aria-label="Choose a game screenshot">
              <button class="carousel-thumb active" type="button" data-index="0" aria-label="Show combat systems screenshot" aria-current="true"><img src="assets/game/independent-pvp-combat.png" alt=""></button>
              <button class="carousel-thumb" type="button" data-index="1" aria-label="Show environment screenshot" aria-current="false"><img src="assets/game/independent-arena-environment.png" alt=""></button>
              <button class="carousel-thumb" type="button" data-index="2" aria-label="Show character animation screenshot" aria-current="false"><img src="assets/game/independent-character-animation.png" alt=""></button>
            </div>

            <div class="carousel-controls">
              <button class="carousel-btn prev" type="button" aria-label="Previous screenshot" aria-controls="game-gallery-track">&#8592;</button>
              <span class="carousel-status" aria-live="polite">1 of 3</span>
              <button class="carousel-btn next" type="button" aria-label="Next screenshot" aria-controls="game-gallery-track">&#8594;</button>
            </div>
          </div>
        </div>
      `
    },
    'ai-tools': {
      title: 'AI-Assisted Engineering Practice',
      status: 'in-progress',
      tag: 'AI-Assisted Delivery',
      content: `
        <h4>How I use AI</h4>
        <p>For approximately 3.5 years, I have used coding agents and language models as part of real engineering work—not as a substitute for engineering judgment.</p>

        <h4>Across the lifecycle</h4>
        <ul>
          <li>Requirements exploration and solution design</li>
          <li>Implementation, debugging, and refactoring</li>
          <li>Documentation, review, and verification</li>
          <li>Rapid prototypes that are hardened before production use</li>
        </ul>
        <p>I retain responsibility for architecture, security, correctness, and production quality. I do not present this experience as model training or claim to be an AI research engineer.</p>
      `
    }
  };

  // Modal functionality
  const modal = document.getElementById('project-modal');
  const modalBody = document.getElementById('modal-body');
  const modalClose = modal?.querySelector('.modal-close');
  const modalOverlay = modal?.querySelector('.modal-overlay');
  let lastFocusedElement = null;

  const openModal = (projectId, initialSlide = 0) => {
    const project = projectData[projectId];
    if (!project || !modal || !modalBody) return;

    lastFocusedElement = document.activeElement;

    modalBody.innerHTML = `
      <h2 id="project-modal-title">${project.title}</h2>
      ${project.content}
    `;

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    initCarousel(initialSlide);
    modalClose?.focus();
  };

  const closeModal = () => {
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocusedElement instanceof HTMLElement) {
      lastFocusedElement.focus();
    }
  };

  // Attach modal triggers
  document.querySelectorAll('.project-card').forEach(card => {
    const btn = card.querySelector('.view-details-btn');
    const projectId = card.dataset.project;

    if (btn && projectId) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openModal(projectId);
      });
    }

    card.querySelectorAll('.project-preview').forEach((preview) => {
      preview.addEventListener('click', (event) => {
        event.preventDefault();
        const initialSlide = Number(preview.dataset.slide);
        openModal(projectId, Number.isInteger(initialSlide) ? initialSlide : 0);
      });
    });
  });

  // Close modal handlers
  modalClose?.addEventListener('click', closeModal);
  modalOverlay?.addEventListener('click', closeModal);

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (!modal?.classList.contains('active')) return;

    if (e.key === 'Escape') {
      closeModal();
      return;
    }

    if (e.key === 'Tab') {
      const focusable = [...modal.querySelectorAll('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element instanceof HTMLElement && !element.hidden);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // Carousel functionality
  let carouselState = { currentIndex: 0 };

  const initCarousel = (initialIndex = 0) => {
    const carousel = modalBody?.querySelector('.gallery-carousel');
    if (!carousel) return;

    const prevBtn = carousel.querySelector('.carousel-btn.prev');
    const nextBtn = carousel.querySelector('.carousel-btn.next');
    const items = [...carousel.querySelectorAll('.carousel-item')];
    const thumbs = [...carousel.querySelectorAll('.carousel-thumb')];
    const status = carousel.querySelector('.carousel-status');

    if (!items.length) return;

    carouselState.currentIndex = Math.min(Math.max(initialIndex, 0), items.length - 1);

    const updateCarousel = () => {
      items.forEach((item, index) => {
        const isCurrent = index === carouselState.currentIndex;
        item.hidden = !isCurrent;
        item.setAttribute('aria-hidden', String(!isCurrent));
      });

      thumbs.forEach((thumb, index) => {
        const isCurrent = index === carouselState.currentIndex;
        thumb.classList.toggle('active', isCurrent);
        thumb.setAttribute('aria-current', String(isCurrent));
      });

      if (prevBtn) prevBtn.disabled = carouselState.currentIndex === 0;
      if (nextBtn) nextBtn.disabled = carouselState.currentIndex === items.length - 1;
      if (status) status.textContent = `${carouselState.currentIndex + 1} of ${items.length}`;
    };

    if (prevBtn) {
      prevBtn.onclick = () => {
        if (carouselState.currentIndex > 0) {
          carouselState.currentIndex--;
          updateCarousel();
        }
      };
    }

    if (nextBtn) {
      nextBtn.onclick = () => {
        if (carouselState.currentIndex < items.length - 1) {
          carouselState.currentIndex++;
          updateCarousel();
        }
      };
    }

    thumbs.forEach((thumb) => {
      thumb.onclick = () => {
        const nextIndex = Number(thumb.dataset.index);
        if (Number.isInteger(nextIndex) && nextIndex >= 0 && nextIndex < items.length) {
          carouselState.currentIndex = nextIndex;
          updateCarousel();
        }
      };
    });

    carousel.onkeydown = (event) => {
      if (event.key === 'ArrowLeft' && carouselState.currentIndex > 0) {
        event.preventDefault();
        carouselState.currentIndex--;
        updateCarousel();
      } else if (event.key === 'ArrowRight' && carouselState.currentIndex < items.length - 1) {
        event.preventDefault();
        carouselState.currentIndex++;
        updateCarousel();
      }
    };

    updateCarousel();
  };
});
