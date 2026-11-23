(() => {
  'use strict';

  // Mobile-only controls. They send the same semantic keys as the existing
  // keyboard controls; player movement and its input loop are not modified.
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
  const smallScreen = window.matchMedia?.('(max-width: 900px)').matches;
  if (!coarsePointer && !smallScreen) return;
  if (document.getElementById('sr-mobile-action') || document.getElementById('sr-mobile-back')) return;

  const style = document.createElement('style');
  style.id = 'sr-mobile-controls-style';
  style.textContent = `
    #sr-mobile-action,#sr-mobile-back{
      position:fixed;z-index:99990;display:flex;align-items:center;justify-content:center;
      min-width:64px;min-height:58px;padding:10px 15px;border:1px solid rgba(190,218,255,.7);
      border-radius:18px;color:#f5f8ff;font:800 13px/1.15 Inter,"Segoe UI",sans-serif;
      letter-spacing:.2px;box-shadow:0 8px 26px rgba(0,0,0,.42),inset 0 1px rgba(255,255,255,.15);
      -webkit-tap-highlight-color:transparent;touch-action:manipulation;user-select:none;
      backdrop-filter:blur(12px);cursor:pointer
    }
    #sr-mobile-action{right:max(18px,env(safe-area-inset-right));bottom:max(24px,env(safe-area-inset-bottom));
      min-width:86px;min-height:72px;border-radius:22px;background:linear-gradient(145deg,#347fbd,#17416f);
      box-shadow:0 7px 24px #061629aa,0 0 22px #4ca9ff33}
    #sr-mobile-back{right:max(16px,env(safe-area-inset-right));top:max(16px,env(safe-area-inset-top));
      min-width:58px;min-height:48px;border-radius:15px;background:linear-gradient(145deg,#263d5b,#101d31)}
    #sr-mobile-action:active,#sr-mobile-back:active{transform:scale(.95);filter:brightness(1.2)}
    #sr-mobile-action .sr-control-icon{font-size:21px;margin-right:7px}
    #sr-mobile-back .sr-control-icon{font-size:19px;margin-right:5px}
    #sr-mobile-action[hidden],#sr-mobile-back[hidden]{display:none!important}
    @media(min-width:901px) and (pointer:fine){#sr-mobile-action,#sr-mobile-back{display:none!important}}
    @media(max-width:520px){#sr-mobile-action{min-width:78px;min-height:66px;right:max(12px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom))}#sr-mobile-back{right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top))}}
  `;
  document.head.appendChild(style);

  const action = document.createElement('button');
  action.type = 'button';
  action.id = 'sr-mobile-action';
  action.setAttribute('aria-label', 'Действие: взаимодействовать');
  action.innerHTML = '<span class="sr-control-icon" aria-hidden="true">E</span><span>ДЕЙСТВИЕ</span>';

  const back = document.createElement('button');
  back.type = 'button';
  back.id = 'sr-mobile-back';
  back.setAttribute('aria-label', 'Назад: закрыть текущее окно или вернуться');
  back.innerHTML = '<span class="sr-control-icon" aria-hidden="true">←</span><span>НАЗАД</span>';

  document.body.append(action, back);

  const visible = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none' &&
    getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length > 0;
  const mainMenu = () => visible(document.getElementById('main-menu-shade'));
  const intro = () => visible(document.getElementById('skyrealm-intro'));
  const modalOpen = () => Array.from(document.querySelectorAll('.shade')).some(el =>
    visible(el) && !['main-menu-shade'].includes(el.id));

  function sendKey(key, code) {
    const target = window;
    target.dispatchEvent(new KeyboardEvent('keydown', {
      key, code, bubbles: true, cancelable: true, composed: true
    }));
    target.dispatchEvent(new KeyboardEvent('keyup', {
      key, code, bubbles: true, cancelable: true, composed: true
    }));
  }

  function refresh() {
    const inGame = !mainMenu() && !intro();
    action.hidden = !inGame || modalOpen();
    back.hidden = intro() || mainMenu();
  }

  action.addEventListener('pointerdown', event => {
    event.preventDefault();
    if (!action.hidden) sendKey('e', 'KeyE');
  });

  function fallbackCloseTopDialog() {
    const shades = Array.from(document.querySelectorAll('.shade')).filter(visible)
      .filter(el => el.id !== 'main-menu-shade');
    const top = shades[shades.length - 1];
    if (!top) return false;
    const close = top.querySelector(
      '[id$="-close"],[data-close],button[aria-label*="закры"],button[aria-label*="close"],.close-button'
    );
    if (close && !close.disabled && visible(close)) {
      close.click();
      return true;
    }
    return false;
  }

  back.addEventListener('pointerdown', event => {
    event.preventDefault();
    if (back.hidden) return;
    sendKey('Escape', 'Escape');
    // Some older panels have their own close button but no Escape handler.
    window.setTimeout(() => {
      if (modalOpen()) fallbackCloseTopDialog();
      refresh();
    }, 90);
  });

  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, {
    subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style', 'aria-hidden']
  });
  window.addEventListener('resize', refresh, { passive: true });
  window.addEventListener('orientationchange', refresh, { passive: true });
  window.addEventListener('pageshow', refresh);
  refresh();
})();
