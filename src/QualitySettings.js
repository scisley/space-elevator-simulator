const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);

export const quality = {
  isMobile,
  daymapPath: isMobile ? '/textures/4k_earth_daymap.jpg' : '/textures/8k_earth_daymap.jpg',
  sphereSegments: isMobile ? 64 : 128,
  antialias: !isMobile,
  pixelRatioCap: isMobile ? 1.5 : 2,
  loadRegionalTiles: !isMobile,
  usePhysicalGlass: !isMobile,
  anisotropy: isMobile ? 4 : 16,
};
