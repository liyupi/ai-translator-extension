/* ============================================
   AI 翻译助手 — 宣传网站交互脚本
   ============================================ */

(function () {
  'use strict';

  /* ---------- 导航栏滚动效果 ---------- */
  var nav = document.getElementById('nav');
  var lastScroll = 0;

  window.addEventListener('scroll', function () {
    var currentScroll = window.pageYOffset;
    if (currentScroll > 20) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
    lastScroll = currentScroll;
  });

  /* ---------- 移动端菜单 ---------- */
  var navToggle = document.getElementById('navToggle');
  var navMobile = document.getElementById('navMobile');

  navToggle.addEventListener('click', function () {
    navToggle.classList.toggle('active');
    navMobile.classList.toggle('active');
  });

  // 点击移动端链接后关闭菜单
  navMobile.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      navToggle.classList.remove('active');
      navMobile.classList.remove('active');
    });
  });

  /* ---------- 滚动揭示动画 ---------- */
  var revealElements = document.querySelectorAll('[data-reveal]');

  if ('IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry, index) {
          if (entry.isIntersecting) {
            // 错开动画时间，营造依次出现的效果
            var delay = index * 100;
            setTimeout(function () {
              entry.target.classList.add('revealed');
            }, delay);
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
    );

    revealElements.forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    // 降级：直接显示
    revealElements.forEach(function (el) {
      el.classList.add('revealed');
    });
  }

  /* ---------- 平滑滚动（锚点偏移修正） ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var targetId = this.getAttribute('href');
      if (targetId === '#') return;

      var target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        var offset = 80; // 导航栏高度
        var targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top: targetPosition, behavior: 'smooth' });
      }
    });
  });

  /* ---------- Hero 演示卡片：循环高亮翻译行 ---------- */
  var demoTranslatedLines = document.querySelectorAll('.demo-line-translated');
  var demoIndex = 0;

  if (demoTranslatedLines.length > 0) {
    setInterval(function () {
      demoTranslatedLines.forEach(function (line) {
        line.style.opacity = '0.4';
      });
      if (demoTranslatedLines[demoIndex]) {
        demoTranslatedLines[demoIndex].style.opacity = '1';
        demoTranslatedLines[demoIndex].style.transition = 'opacity 0.5s ease';
      }
      demoIndex = (demoIndex + 1) % demoTranslatedLines.length;
    }, 2500);
  }

})();
