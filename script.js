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
      title: 'Internal Operations System (2025)',
      status: 'done',
      tag: 'Ops Automation',
      content: `
        <h4>Project Overview</h4>
        <p>Built from scratch to handle the complete lifecycle of solar installation projects - from initial customer contact through installation and invoicing.</p>

        <h4>Key Features</h4>
        <ul>
          <li>Real-time workflow tracking across sales, installation, and billing teams</li>
          <li>Automated customer communication and documentation</li>
          <li>JotForm integration for onsite protocols</li>
          <li>Reduced manual work by ~80%</li>
        </ul>
      `
    },
    'arena-game': {
      title: 'Arena PvP Game (Godot 4)',
      status: 'in-progress',
      tag: 'Game Dev',
      hasCarousel: true,
      content: `
        <h4>About the Game</h4>
        <p>A fast-paced 3D arena combat game built in Godot 4, focusing on tight controls and engaging multiplayer mechanics.</p>

        <h4>Technical Focus</h4>
        <ul>
          <li>Character controller with responsive movement physics</li>
          <li>Multiplayer networking architecture</li>
          <li>Combat system with hitboxes and damage calculation</li>
          <li>UI/UX design for competitive gameplay</li>
        </ul>

        <div class="project-gallery">
          <div class="gallery-carousel">
            <div class="carousel-track">
              <div class="carousel-item">
                <div class="placeholder-image">Screenshot 1</div>
              </div>
              <div class="carousel-item">
                <div class="placeholder-image">Screenshot 2</div>
              </div>
              <div class="carousel-item">
                <div class="placeholder-image">Screenshot 3</div>
              </div>
            </div>
            <button class="carousel-btn prev" aria-label="Previous image">&lt;</button>
            <button class="carousel-btn next" aria-label="Next image">&gt;</button>
          </div>
        </div>
      `
    },
    'ai-tools': {
      title: 'AI Tools & Experiments',
      status: 'done',
      tag: 'LLM',
      content: `
        <h4>AI Integration Projects</h4>
        <p>A collection of practical AI-powered tools built to solve real workflow challenges.</p>

        <h4>Tools Built</h4>
        <ul>
          <li>Code generation and refactoring assistants</li>
          <li>Document automation and summarization tools</li>
          <li>Customer communication templates with context awareness</li>
          <li>Prompt engineering frameworks for consistent outputs</li>
        </ul>
      `
    },
    'sunsettle': {
      title: 'Sunsettle',
      status: 'in-progress',
      tag: 'Apps',
      hasCarousel: true,
      content: `
        <h4>The Concept</h4>
        <p>Stop guessing, start catching. Sunsettle analyzes live weather conditions, cloud patterns, air clarity, and terrain to deliver one beautifully simple number: your Sunset Beauty Score (0-100).</p>

        <h4>Core Features</h4>
        <ul>
          <li><strong>Sunset Beauty Score:</strong> 0-100 rating with confidence level and exact timing</li>
          <li><strong>Smart Predictions:</strong> Tells you when to go, where to face, and what colors to expect</li>
          <li><strong>Saved Spots:</strong> Pin and track your favorite sunset locations</li>
          <li><strong>Live Pulse Map:</strong> See when other users signal amazing sunsets in real-time</li>
          <li><strong>Offline-Friendly:</strong> Caches predictions so you're covered without signal</li>
        </ul>

        <h4>Who It's For</h4>
        <ul>
          <li>Photographers timing golden hour shoots</li>
          <li>Romantics planning the perfect evening</li>
          <li>Walkers and hikers optimizing their routes</li>
          <li>Anyone who's thought "I wish I'd known the sunset would be this good"</li>
        </ul>

        <h4>Technical Stack</h4>
        <p>Built with React Native for cross-platform mobile. Integrates OpenWeatherMap, Sunrise-Sunset.org, elevation models, and optional air-quality feeds for intelligent predictions.</p>

        <div class="project-gallery">
          <div class="gallery-carousel">
            <div class="carousel-track">
              <div class="carousel-item">
                <div class="placeholder-image">App Screenshot 1</div>
              </div>
              <div class="carousel-item">
                <div class="placeholder-image">App Screenshot 2</div>
              </div>
              <div class="carousel-item">
                <div class="placeholder-image">App Screenshot 3</div>
              </div>
            </div>
            <button class="carousel-btn prev" aria-label="Previous image">&lt;</button>
            <button class="carousel-btn next" aria-label="Next image">&gt;</button>
          </div>
        </div>
      `
    }
  };

  // Modal functionality
  const modal = document.getElementById('project-modal');
  const modalBody = document.getElementById('modal-body');
  const modalClose = modal?.querySelector('.modal-close');
  const modalOverlay = modal?.querySelector('.modal-overlay');

  const openModal = (projectId) => {
    const project = projectData[projectId];
    if (!project) return;

    modalBody.innerHTML = `
      <h2>${project.title}</h2>
      ${project.content}
    `;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Initialize carousel if present
    setTimeout(() => initCarousel(), 100);
  };

  const closeModal = () => {
    modal.classList.remove('active');
    document.body.style.overflow = '';
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
  });

  // Close modal handlers
  modalClose?.addEventListener('click', closeModal);
  modalOverlay?.addEventListener('click', closeModal);

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal();
    }
  });

  // Carousel functionality
  let carouselState = { currentIndex: 0 };

  const initCarousel = () => {
    const carousel = document.querySelector('.gallery-carousel');
    if (!carousel) return;

    const track = carousel.querySelector('.carousel-track');
    const prevBtn = carousel.querySelector('.carousel-btn.prev');
    const nextBtn = carousel.querySelector('.carousel-btn.next');
    const items = carousel.querySelectorAll('.carousel-item');

    if (!track || !items.length) return;

    carouselState.currentIndex = 0;

    const updateCarousel = () => {
      const offset = -carouselState.currentIndex * 100;
      track.style.transform = `translateX(${offset}%)`;

      if (prevBtn) prevBtn.disabled = carouselState.currentIndex === 0;
      if (nextBtn) nextBtn.disabled = carouselState.currentIndex === items.length - 1;
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

    updateCarousel();
  };
});
