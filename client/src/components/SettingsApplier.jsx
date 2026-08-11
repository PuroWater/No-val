import { useEffect } from 'react';
import { api } from '../api.js';

const FONT_MAP = { small: '12px', medium: '14px', large: '16px' };

export function applySettings(settings) {
  document.documentElement.dataset.theme = settings.theme || 'paper';
  document.documentElement.style.fontSize = FONT_MAP[settings.fontSize] || '16px';
}

export default function SettingsApplier() {
  useEffect(() => {
    api('/settings')
      .then((data) => applySettings(data.settings))
      .catch(() => {});
  }, []);
  return null;
}
