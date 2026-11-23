(() => {
  'use strict';

  // A deterministic, visual-only spawn hub. It deliberately does not alter
  // collision, player coordinates, input, movement, saves, or world progression.
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function draw(ctx, camX, camY, time, tileSize, apocalypse) {
    if (!ctx || !Number.isFinite(camX) || !Number.isFinite(camY)) return;
    const tile = Number.isFinite(tileSize) && tileSize > 0 ? tileSize : 32;
    const cx = 21 * tile + 16, cy = 26 * tile + 16;
    const sx = cx - camX, sy = cy - camY;
    if (sx < -560 || sx > (window.innerWidth || 900) + 560 ||
        sy < -520 || sy > (window.innerHeight || 700) + 520) return;

    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));
    const pulse = .5 + .5 * Math.sin((Number(time) || 0) / 470);
    const warm = apocalypse ? '#e6a46a' : '#f1d18a';
    const wood = apocalypse ? '#514237' : '#765337';
    const stone = apocalypse ? '#42464a' : '#8d8877';

    // The central square sits beside the existing east-west spawn road.
    ctx.fillStyle = apocalypse ? 'rgba(23,26,27,.64)' : 'rgba(75,91,57,.34)';
    ctx.beginPath(); ctx.ellipse(0, 15, 286, 238, -.035, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = apocalypse ? '#373737' : '#867b63';
    ctx.beginPath(); ctx.ellipse(0, 12, 222, 174, -.035, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = apocalypse ? 'rgba(173,139,104,.38)' : 'rgba(226,205,157,.48)';
    ctx.lineWidth = 4; ctx.setLineDash([12, 9]);
    ctx.beginPath(); ctx.ellipse(0, 12, 210, 162, -.035, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    // Worn paths connect the hub's buildings while leaving the original road clear.
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = apocalypse ? '#4b4540' : '#9b815b'; ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.moveTo(-205, -126); ctx.lineTo(-95, -45); ctx.lineTo(0, 16); ctx.lineTo(185, -128);
    ctx.moveTo(-205, 140); ctx.lineTo(-92, 65); ctx.lineTo(0, 16); ctx.lineTo(190, 145);
    ctx.moveTo(0, 16); ctx.lineTo(0, -172); ctx.stroke();
    ctx.strokeStyle = apocalypse ? 'rgba(176,148,117,.32)' : 'rgba(236,211,164,.35)';
    ctx.lineWidth = 2; ctx.setLineDash([7, 10]);
    ctx.beginPath(); ctx.moveTo(-205, -126); ctx.lineTo(-95, -45); ctx.lineTo(0, 16); ctx.lineTo(185, -128);
    ctx.moveTo(-205, 140); ctx.lineTo(-92, 65); ctx.lineTo(0, 16); ctx.lineTo(190, 145);
    ctx.moveTo(0, 16); ctx.lineTo(0, -172); ctx.stroke(); ctx.setLineDash([]);

    function shadow(x, y, rx, ry) {
      ctx.fillStyle = 'rgba(0,0,0,.34)'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    }
    function lamp(x, y, tall = false) {
      ctx.save(); ctx.translate(x, y); shadow(0, 13, 13, 5);
      ctx.fillStyle = '#24292a'; ctx.fillRect(-3, -27, 6, 40);
      ctx.fillStyle = apocalypse ? '#4d5050' : '#514332'; ctx.fillRect(-9, -34, 18, 10);
      ctx.fillStyle = warm; ctx.shadowColor = warm; ctx.shadowBlur = 15 + pulse * 12;
      ctx.fillRect(-4, -32, 8, 6); ctx.shadowBlur = 0;
      const glow = ctx.createRadialGradient(0, -29, 2, 0, -29, tall ? 52 : 38);
      glow.addColorStop(0, apocalypse ? 'rgba(255,174,103,.22)' : 'rgba(255,225,154,.23)');
      glow.addColorStop(1, 'rgba(255,190,100,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, -29, tall ? 52 : 38, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    function crate(x, y, size = 1, marked = false) {
      ctx.save(); ctx.translate(x, y); ctx.scale(size, size); shadow(0, 11, 17, 6);
      ctx.fillStyle = '#392a20'; ctx.fillRect(-14, -13, 28, 25);
      ctx.fillStyle = marked ? '#8a5940' : '#9a7045'; ctx.fillRect(-12, -12, 24, 21);
      ctx.strokeStyle = '#d0a36b'; ctx.lineWidth = 2; ctx.strokeRect(-10, -10, 20, 17);
      ctx.beginPath(); ctx.moveTo(-12, -3); ctx.lineTo(12, -3); ctx.moveTo(-3, -12); ctx.lineTo(-3, 9); ctx.stroke();
      if (marked) { ctx.fillStyle = '#e7d3a8'; ctx.fillRect(-4, -2, 8, 5); }
      ctx.restore();
    }
    function barrel(x, y, rusty = false) {
      ctx.save(); ctx.translate(x, y); shadow(0, 12, 13, 5);
      ctx.fillStyle = rusty ? '#50342b' : '#6b472d';
      ctx.beginPath(); ctx.moveTo(-10, -15); ctx.quadraticCurveTo(-15, 0, -10, 12);
      ctx.quadraticCurveTo(0, 17, 10, 12); ctx.quadraticCurveTo(15, 0, 10, -15); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rusty ? '#9a5943' : '#a97843'; ctx.fillRect(-11, -12, 22, 4); ctx.fillRect(-12, 2, 24, 4);
      ctx.strokeStyle = '#302b27'; ctx.lineWidth = 1.5; ctx.strokeRect(-10, -15, 20, 27);
      ctx.restore();
    }
    function tent(x, y, color, label) {
      ctx.save(); ctx.translate(x, y); shadow(0, 23, 54, 12);
      ctx.fillStyle = '#252526'; ctx.beginPath(); ctx.moveTo(-55, 18); ctx.lineTo(-2, -39); ctx.lineTo(54, 18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-49, 15); ctx.lineTo(-2, -33); ctx.lineTo(48, 15); ctx.closePath(); ctx.fill();
      ctx.fillStyle = apocalypse ? '#302a26' : '#57442f'; ctx.beginPath(); ctx.moveTo(-13, 17); ctx.lineTo(-2, -7); ctx.lineTo(10, 17); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(238,220,185,.48)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-2, -33); ctx.lineTo(-2, 16); ctx.stroke();
      ctx.fillStyle = warm; ctx.font = '800 9px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText(label, 0, 34);
      ctx.restore();
    }
    function shed(x, y, w, h, roof, label, signColor = warm) {
      ctx.save(); ctx.translate(x, y); shadow(0, h * .47, w * .63, 12);
      ctx.fillStyle = '#242321'; ctx.fillRect(-w / 2 - 5, -h * .24, w + 10, h * .72);
      ctx.fillStyle = apocalypse ? '#5b5148' : '#b89a6e'; ctx.fillRect(-w / 2, -h * .25, w, h * .68);
      ctx.fillStyle = roof; ctx.beginPath(); ctx.moveTo(-w / 2 - 12, -h * .22); ctx.lineTo(0, -h * .72); ctx.lineTo(w / 2 + 12, -h * .22); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = apocalypse ? '#2b2928' : '#68482e'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-w / 2, -h * .2); ctx.lineTo(-w / 2, h * .38); ctx.moveTo(w / 2, -h * .2); ctx.lineTo(w / 2, h * .38); ctx.stroke();
      ctx.fillStyle = '#28221e'; ctx.fillRect(-10, h * .02, 20, h * .4);
      ctx.fillStyle = '#f0d69b'; ctx.fillRect(-w * .32, -h * .06, 15, 15); ctx.fillRect(w * .2, -h * .06, 15, 15);
      ctx.fillStyle = signColor; ctx.fillRect(-w * .34, -h * .45, w * .68, 8);
      ctx.fillStyle = '#fff0cf'; ctx.font = '800 8px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText(label, 0, -h * .49);
      ctx.restore();
    }
    function watchTower(x, y) {
      ctx.save(); ctx.translate(x, y); shadow(0, 38, 43, 10);
      ctx.strokeStyle = '#4b4135'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(-27, 30); ctx.lineTo(-21, -43); ctx.moveTo(27, 30); ctx.lineTo(21, -43);
      ctx.moveTo(-27, 1); ctx.lineTo(27, 1); ctx.moveTo(-24, -24); ctx.lineTo(24, -24); ctx.stroke();
      ctx.fillStyle = apocalypse ? '#51514d' : '#8c704d'; ctx.fillRect(-37, -58, 74, 22);
      ctx.fillStyle = apocalypse ? '#313536' : '#68482e'; ctx.fillRect(-42, -64, 84, 7);
      ctx.fillStyle = '#c8b28a'; ctx.fillRect(-5, -57, 10, 9);
      ctx.strokeStyle = '#a88b63'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(33, 29); ctx.lineTo(33, -42); ctx.moveTo(27, -30); ctx.lineTo(39, -30); ctx.moveTo(27, -18); ctx.lineTo(39, -18); ctx.moveTo(27, -6); ctx.lineTo(39, -6); ctx.stroke();
      ctx.restore();
    }
    function generator(x, y) {
      ctx.save(); ctx.translate(x, y); shadow(0, 19, 36, 9);
      ctx.fillStyle = '#262d2e'; ctx.fillRect(-31, -24, 62, 40);
      ctx.fillStyle = '#69736d'; ctx.fillRect(-27, -20, 54, 31);
      ctx.fillStyle = '#283033'; ctx.fillRect(-18, -13, 25, 20);
      ctx.fillStyle = '#e3a65e'; ctx.shadowColor = '#e39c4d'; ctx.shadowBlur = 9; ctx.fillRect(-13, -8, 15, 9); ctx.shadowBlur = 0;
      ctx.fillStyle = '#b4b6a9'; ctx.fillRect(12, -17, 10, 7); ctx.fillRect(15, -31, 5, 15);
      ctx.fillStyle = '#d2c8a9'; ctx.font = '800 8px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText('ГЕНЕРАТОР', 0, 29);
      ctx.restore();
    }
    function vehicle(x, y) {
      ctx.save(); ctx.translate(x, y); shadow(0, 24, 57, 13);
      ctx.fillStyle = '#1d2224'; ctx.fillRect(-56, -13, 112, 36);
      ctx.fillStyle = '#59615d'; ctx.fillRect(-48, -20, 96, 32);
      ctx.fillStyle = '#343a39'; ctx.fillRect(-23, -34, 48, 20);
      ctx.fillStyle = '#9aa19a'; ctx.fillRect(-17, -31, 17, 12); ctx.fillRect(4, -31, 16, 12);
      ctx.fillStyle = '#292b2b'; ctx.fillRect(-47, 8, 20, 8); ctx.fillRect(28, 8, 20, 8);
      ctx.fillStyle = '#8c493b'; ctx.fillRect(-43, -2, 8, 5); ctx.fillRect(35, -2, 8, 5);
      ctx.strokeStyle = '#a36b50'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-38, -17); ctx.lineTo(-20, -6); ctx.lineTo(-29, 6); ctx.stroke();
      ctx.fillStyle = '#c4a16e'; ctx.font = '800 8px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText('ЭВАКУАЦИЯ', 0, 34);
      ctx.restore();
    }
    function survivor(x, y, color, phase) {
      ctx.save(); ctx.translate(x, y + Math.sin((Number(time) || 0) / 250 + phase) * 1.3);
      shadow(0, 14, 10, 4); ctx.fillStyle = '#292c2d'; ctx.fillRect(-5, 2, 4, 12); ctx.fillRect(2, 2, 4, 12);
      ctx.fillStyle = color; ctx.fillRect(-8, -9, 16, 14); ctx.fillStyle = '#c59b75'; ctx.beginPath(); ctx.arc(0, -15, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#25272a'; ctx.fillRect(-7, -21, 14, 4); ctx.fillStyle = '#e8d1a8'; ctx.fillRect(-4, -16, 2, 2); ctx.fillRect(3, -16, 2, 2);
      ctx.restore();
    }
    function sandbags(x, y, count = 5) {
      ctx.save(); ctx.translate(x, y);
      for (let i = 0; i < count; i++) {
        const px = (i - (count - 1) / 2) * 18;
        ctx.fillStyle = '#4b4a3d'; ctx.beginPath(); ctx.ellipse(px, 0, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#77705a'; ctx.beginPath(); ctx.ellipse(px - 1, -2, 8, 4, -.1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    function fence(x1, y1, x2, y2, posts = 8) {
      ctx.strokeStyle = apocalypse ? '#454340' : '#6c553b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      for (let i = 0; i <= posts; i++) {
        const t = i / posts, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
        ctx.fillStyle = apocalypse ? '#4e4b45' : '#765a39'; ctx.fillRect(x - 2, y - 8, 4, 18);
      }
      if (apocalypse) {
        ctx.strokeStyle = 'rgba(179,159,131,.45)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x1, y1 - 5); ctx.lineTo(x2, y2 - 5); ctx.stroke();
      }
    }

    if (apocalypse) {
      // A survivor checkpoint with a visible identity, supply chain and working-looking power grid.
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(0, 12, 268, 214, 0, 0, Math.PI * 2); ctx.fill();
      fence(-270, -212, -120, -235, 5); fence(115, -235, 270, -208, 5);
      fence(-270, 212, -110, 236, 5); fence(120, 236, 270, 208, 5);
      fence(-270, -212, -280, -80, 4); fence(-280, 90, -270, 212, 4);
      fence(270, -208, 280, -75, 4); fence(280, 95, 270, 208, 4);
      // North-west guard post and command shelter.
      watchTower(-205, -156);
      shed(-85, -151, 92, 70, '#424d4e', 'ШТАБ');
      ctx.fillStyle = '#bca57a'; ctx.fillRect(-104, -186, 38, 9);
      ctx.fillStyle = '#242a2b'; ctx.fillRect(-100, -184, 30, 5);
      ctx.fillStyle = '#d4b47c'; ctx.font = '800 8px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText('КАРТА РАЙОНА', -85, -174);
      // Medical point and quarantine shelter.
      tent(190, -151, '#68715e', 'МЕДПУНКТ');
      ctx.fillStyle = '#e4e4d8'; ctx.fillRect(176, -190, 28, 8);
      ctx.fillStyle = '#a94a42'; ctx.fillRect(187, -194, 7, 16); ctx.fillRect(182, -189, 17, 6);
      tent(65, -218, '#625447', 'КАРАНТИН');
      // Workshop, storage and power corner.
      shed(-195, 157, 112, 78, '#5b4c3c', 'МАСТЕРСКАЯ');
      shed(190, 157, 110, 78, '#4b5150', 'СКЛАД');
      generator(40, 173); barrel(85, 185, true); barrel(111, 181, true);
      ctx.strokeStyle = '#282b29'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(40, 173); ctx.bezierCurveTo(12, 134, -48, 130, -72, 152); ctx.stroke();
      ctx.strokeStyle = '#9d7c50'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(40, 173); ctx.bezierCurveTo(12, 134, -48, 130, -72, 152); ctx.stroke();
      // Radio mast with a blinking red beacon.
      ctx.strokeStyle = '#41494a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, -205); ctx.lineTo(-15, -303); ctx.moveTo(0, -205); ctx.lineTo(15, -303); ctx.moveTo(-15, -303); ctx.lineTo(15, -303); ctx.moveTo(-10, -263); ctx.lineTo(10, -263); ctx.moveTo(-13, -237); ctx.lineTo(13, -237); ctx.stroke();
      ctx.strokeStyle = '#6f7771'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -303); ctx.lineTo(0, -326); ctx.stroke();
      ctx.fillStyle = pulse > .48 ? '#e05a4d' : '#7c3d36'; ctx.shadowColor = '#e05a4d'; ctx.shadowBlur = pulse > .48 ? 13 : 4; ctx.beginPath(); ctx.arc(0, -328, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#7a7770'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -295, 22, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
      // Evacuation van, sandbag line and checkpoint barriers leave the road's centre open.
      vehicle(245, 66); sandbags(-245, 54, 6); sandbags(247, -42, 5);
      ctx.fillStyle = '#4d4840'; ctx.fillRect(267, -27, 42, 9); ctx.fillRect(267, 21, 42, 9);
      ctx.fillStyle = '#c6a66e'; ctx.fillRect(272, -25, 32, 5); ctx.fillRect(272, 23, 32, 5);
      // Supply crates, drums, field lights, radio and notice board.
      crate(-145, 187, 1.05, true); crate(-115, 197, .82); crate(150, 195, .9, true);
      crate(218, -74, .8); barrel(-145, -95, true); barrel(-120, -94, true);
      lamp(-260, -105, true); lamp(260, 125, true); lamp(-255, 154, true);
      // A campfire and central planning board form the recognizable spawn landmark.
      shadow(0, 105, 38, 12);
      ctx.fillStyle = '#514031'; ctx.beginPath(); ctx.arc(0, 98, 25, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#282522'; ctx.beginPath(); ctx.arc(0, 98, 18, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#9a7953'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-19, 103); ctx.lineTo(17, 93); ctx.moveTo(-17, 91); ctx.lineTo(16, 106); ctx.stroke();
      ctx.fillStyle = '#f28b43'; ctx.shadowColor = '#ff6b35'; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.moveTo(-8, 103); ctx.quadraticCurveTo(-16, 86, -3, 78); ctx.quadraticCurveTo(1, 90, 7, 82); ctx.quadraticCurveTo(17, 100, 3, 108); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe3a1'; ctx.beginPath(); ctx.moveTo(-2, 102); ctx.quadraticCurveTo(-5, 91, 3, 88); ctx.quadraticCurveTo(10, 101, -2, 102); ctx.fill(); ctx.shadowBlur = 0;
      const fireGlow = ctx.createRadialGradient(0, 98, 4, 0, 98, 92);
      fireGlow.addColorStop(0, 'rgba(255,146,69,.2)'); fireGlow.addColorStop(1, 'rgba(255,130,55,0)');
      ctx.fillStyle = fireGlow; ctx.beginPath(); ctx.arc(0, 98, 92, 0, Math.PI * 2); ctx.fill();
      crate(-50, 104, .78); crate(50, 108, .78);
      survivor(-62, 35, '#667c70', 0); survivor(70, 49, '#78624e', 2); survivor(120, 125, '#4e6874', 4);
      // Perimeter signage.
      ctx.fillStyle = '#292b2b'; ctx.fillRect(-42, -260, 84, 24);
      ctx.strokeStyle = '#b28d5d'; ctx.lineWidth = 2; ctx.strokeRect(-42, -260, 84, 24);
      ctx.fillStyle = '#e9c28a'; ctx.font = '900 10px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText('ПУНКТ  ВЫЖИВШИХ', 0, -245);
      ctx.fillStyle = '#c6b08b'; ctx.font = '800 8px Segoe UI'; ctx.fillText('СЕКТОР 01 · БЕЗОПАСНАЯ ЗОНА', 0, -232);
    } else {
      // The regular world gets a welcoming starter village around the same spawn point.
      shed(-175, -150, 92, 68, '#9a5942', 'ДОМ СТАРОСТЫ', '#f0d69b');
      shed(178, -150, 92, 68, '#52734c', 'МАСТЕРСКАЯ', '#f0d69b');
      tent(0, -206, '#557d8e', 'ГОСТЕВОЙ ДОМ');
      shed(-180, 151, 104, 72, '#9b7945', 'ЛАВКА', '#f0d69b');
      shed(184, 151, 104, 72, '#6c674d', 'СКЛАД', '#f0d69b');
      fence(-260, -205, -110, -226, 5); fence(115, -226, 260, -205, 5);
      fence(-260, 205, -110, 226, 5); fence(115, 226, 260, 205, 5);
      // Well, market awning, garden beds and lantern-lit footpaths.
      shadow(0, 80, 38, 12); ctx.fillStyle = '#65513a'; ctx.beginPath(); ctx.arc(0, 73, 25, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a6a18a'; ctx.beginPath(); ctx.arc(0, 73, 19, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#316c7b'; ctx.beginPath(); ctx.arc(0, 73, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6b4d30'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-20, 49); ctx.lineTo(-20, 27); ctx.moveTo(20, 49); ctx.lineTo(20, 27); ctx.moveTo(-23, 27); ctx.lineTo(23, 27); ctx.stroke();
      ctx.fillStyle = '#9a5942'; ctx.beginPath(); ctx.moveTo(-27, 27); ctx.lineTo(0, 8); ctx.lineTo(27, 27); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d0a56b'; ctx.fillRect(-30, 27, 60, 5);
      ctx.fillStyle = '#62432d'; ctx.fillRect(-225, 45, 56, 24); ctx.fillStyle = '#b68a55'; ctx.fillRect(-221, 49, 48, 16);
      ctx.fillStyle = '#a34f43'; ctx.beginPath(); ctx.moveTo(-231, 45); ctx.lineTo(-197, 19); ctx.lineTo(-163, 45); ctx.closePath(); ctx.fill();
      for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
        ctx.fillStyle = '#4e753d'; ctx.fillRect(110 + col * 19, 183 + row * 16, 11, 8);
        ctx.fillStyle = (row + col) % 2 ? '#d6b65f' : '#91b85b'; ctx.fillRect(108 + col * 19, 178 + row * 16, 15, 6);
      }
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3, x = Math.cos(a) * 154, y = Math.sin(a) * 118;
        ctx.fillStyle = '#416b42'; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5d8a4e'; ctx.beginPath(); ctx.arc(x - 5, y - 6, 10, 0, Math.PI * 2); ctx.fill();
      }
      lamp(-245, -83); lamp(245, -83); lamp(-245, 145); lamp(245, 145);
      crate(-115, 180, .9); crate(117, -75, .8);
      survivor(-62, 35, '#7c6b4f', 0); survivor(65, 43, '#587b61', 2); survivor(112, 120, '#7b6256', 4);
      ctx.fillStyle = '#725337'; ctx.fillRect(-47, -258, 94, 25);
      ctx.fillStyle = '#f2d9a2'; ctx.font = '900 10px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText('СТАРТОВОЕ ПОСЕЛЕНИЕ', 0, -242);
    }

    // Small ground clutter and lighting finish the scene without obscuring the player.
    for (let i = 0; i < 10; i++) {
      const x = -235 + ((i * 53) % 470), y = -190 + ((i * 79) % 380);
      ctx.fillStyle = apocalypse ? 'rgba(180,151,116,.32)' : 'rgba(238,218,169,.35)';
      ctx.beginPath(); ctx.ellipse(x, y, 3 + (i % 3), 1.5, i * .6, 0, Math.PI * 2); ctx.fill();
    }
    lamp(-245, -83); lamp(245, -83);
    ctx.restore();
  }

  window.SkyRealmSpawnSettlement = Object.freeze({ draw });
})();
