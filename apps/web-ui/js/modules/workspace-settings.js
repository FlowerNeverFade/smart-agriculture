/* Shared browser-only workspace settings controller.
 * Role shells provide their own template, but all of them use this same
 * state/normalisation path so appearance controls cannot drift by role.
 */
import { ACCENT_OPTIONS, DEFAULT_USER_SETTINGS, FONT_FAMILY_OPTIONS, PRESET_OPTIONS, SURFACE_STYLE_OPTIONS, applyUserSettings, readUserSettings, saveUserSettings } from '../user-settings.js?v=20260901-workspace-settings-v3';

export function createWorkspaceSettingsController({ props, emit, ref, computed }) {
  const account = computed(() => props.state?.currentUser || null);
  const settings = ref(readUserSettings(undefined, account.value));
  const themeOptions = [
    { value: 'light', label: '白色', hint: '清爽明亮，适合日常工作' },
    { value: 'dark', label: '黑色', hint: '低光环境更舒适' },
    { value: 'system', label: '跟随系统', hint: '自动适配设备明暗' }
  ];
  const refreshOptions = [5, 15, 30, 60];
  const roleLabel = computed(() => props.state?.currentUser?.roleLabel || '当前身份');
  const themeLabel = computed(() => themeOptions.find(item => item.value === settings.value.theme)?.label || '白色');
  const presetLabel = computed(() => PRESET_OPTIONS.find(item => item.value === settings.value.preset)?.label || 'Codex 中性');
  const accentLabel = computed(() => ACCENT_OPTIONS.find(item => item.value === settings.value.accent)?.label || '田野绿');
  const surfaceStyleLabel = computed(() => SURFACE_STYLE_OPTIONS.find(item => item.value === settings.value.surfaceStyle)?.label || '经典卡片');
  const fontLabel = computed(() => FONT_FAMILY_OPTIONS.find(item => item.value === settings.value.fontFamily)?.label || '系统默认');
  const updateSetting = (key, value) => {
    const patch = key === 'accent' ? { [key]: value, customAccent: '' } : { [key]: value };
    const next = saveUserSettings({ ...settings.value, ...patch }, undefined, account.value);
    settings.value = next;
    applyUserSettings(next);
    emit?.('settings-changed', next);
  };
  const resetSettings = () => {
    const next = saveUserSettings(DEFAULT_USER_SETTINGS, undefined, account.value);
    settings.value = next;
    applyUserSettings(next);
    emit?.('settings-changed', next);
  };
  return {
    account, settings, themeOptions, refreshOptions,
    presetOptions: PRESET_OPTIONS, accentOptions: ACCENT_OPTIONS,
    surfaceStyleOptions: SURFACE_STYLE_OPTIONS, fontOptions: FONT_FAMILY_OPTIONS,
    roleLabel, themeLabel, presetLabel, accentLabel, surfaceStyleLabel, fontLabel,
    updateSetting, resetSettings
  };
}
