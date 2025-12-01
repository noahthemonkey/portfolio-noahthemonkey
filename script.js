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
});
