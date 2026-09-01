/* Shared browser-only workspace settings controller.
 * Every role shell mounts the same view and this same state/normalisation
 * path, so appearance controls cannot drift by role.
 */
import { ACCENT_OPTIONS, DEFAULT_USER_SETTINGS, FONT_FAMILY_OPTIONS, PRESET_OPTIONS, SURFACE_STYLE_OPTIONS, applyUserSettings, normalizeUserSettings, readUserSettings, saveUserSettings } from '../user-settings.js?v=20260901-v5910-main-merge-v2';

export function createWorkspaceSettingsController({ props, emit, ref, computed, watch }) {
  const account = computed(() => props.state?.currentUser || null);
  const externalSettings = computed(() => props.userSettings || null);
  const settings = ref(normalizeUserSettings(externalSettings.value || readUserSettings(undefined, account.value)));
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

    // Fix browser bug: changing global dataset on html can cause a layout recalculation 
    // that forces the browser to scroll the overflow-hidden body to keep the focused 
    // checkbox in view, causing a permanent page shift. Reset it to 0.
    setTimeout(() => {
      if (document.body && document.body.scrollTop > 0) document.body.scrollTop = 0;
      if (document.documentElement && document.documentElement.scrollTop > 0) document.documentElement.scrollTop = 0;
    }, 0);
    requestAnimationFrame(() => {
      if (document.body && document.body.scrollTop > 0) document.body.scrollTop = 0;
      if (document.documentElement && document.documentElement.scrollTop > 0) document.documentElement.scrollTop = 0;
    });
  };
  const resetSettings = () => {
    const next = saveUserSettings(DEFAULT_USER_SETTINGS, undefined, account.value);
    settings.value = next;
    applyUserSettings(next);
    emit?.('settings-changed', next);
  };
  // The shell owns the canonical ref because it also drives its header,
  // polling timer and theme listener. Keep this shared view in sync when a
  // setting is changed outside the page (for example by the header toggle).
  watch?.(externalSettings, (next) => {
    if (!next) return;
    const normalized = normalizeUserSettings(next);
    if (JSON.stringify(normalized) !== JSON.stringify(settings.value)) settings.value = normalized;
  }, { deep: true });
  return {
    account, settings, themeOptions, refreshOptions,
    presetOptions: PRESET_OPTIONS, accentOptions: ACCENT_OPTIONS,
    surfaceStyleOptions: SURFACE_STYLE_OPTIONS, fontOptions: FONT_FAMILY_OPTIONS,
    roleLabel, themeLabel, presetLabel, accentLabel, surfaceStyleLabel, fontLabel,
    updateSetting, resetSettings
  };
}

/*
 * The settings page is a real shared component rather than three look-alike
 * templates.  Role shells only provide their current-user state and listen to
 * the settings-changed event; labels, controls and update behaviour stay in
 * this one module.
 */
const WORKSPACE_SETTINGS_TEMPLATE = `
  <section class="settings-page" aria-labelledby="settings-page-title">
    <header class="settings-page-header">
      <div>
        <span class="settings-kicker">{{ roleLabel }} · 个人偏好</span>
        <h1 id="settings-page-title"><app-icon name="settings"></app-icon> 工作台设置</h1>
        <p>自定义当前浏览器中的外观、信息密度和数据刷新方式。设置即时生效，不会修改服务器上的业务数据。</p>
      </div>
      <span class="settings-local-badge"><app-icon name="lock_reset"></app-icon> 仅本机保存</span>
    </header>

    <div class="settings-grid">
      <article class="g-card settings-card">
        <div class="settings-card-head"><div><span class="settings-card-kicker">显示外观</span><h2>主题与颜色</h2><p>让三种角色的工作台保持清晰统一，也可以按个人习惯调整。</p></div><app-icon name="tune"></app-icon></div>
        <div class="settings-field">
          <span class="settings-label">主题</span>
          <div class="settings-theme-options" role="group" aria-label="选择主题">
            <button v-for="theme in themeOptions" :key="theme.value" type="button" class="settings-theme-option" :class="{active: settings.theme === theme.value}" @click="updateSetting('theme', theme.value)"><span class="settings-theme-icon"><app-icon :name="theme.value === 'dark' ? 'dark_mode' : theme.value === 'light' ? 'light_mode' : 'settings'"></app-icon></span><strong>{{ theme.label }}</strong><small>{{ theme.hint }}</small></button>
          </div>
        </div>
        <div class="settings-field">
          <span class="settings-label">工作台主题</span>
          <div class="settings-preset-grid" role="group" aria-label="选择工作台主题">
            <button v-for="preset in presetOptions" :key="preset.value" type="button" class="settings-preset-option" :class="['preset-' + preset.value, {active: settings.preset === preset.value}]" @click="updateSetting('preset', preset.value)"><span class="settings-preset-preview"><i></i><b></b><em></em></span><span class="settings-preset-copy"><strong>{{ preset.label }}</strong><small>{{ preset.hint }}</small></span><app-icon v-if="settings.preset === preset.value" name="check_circle"></app-icon></button>
          </div>
        </div>
        <div class="settings-field">
          <span class="settings-label">卡片风格</span>
          <div class="settings-theme-options settings-surface-options" role="group" aria-label="选择卡片风格">
            <button v-for="surface in surfaceStyleOptions" :key="surface.value" type="button" class="settings-theme-option settings-surface-option" :data-style="surface.value" :data-surface-style="surface.value" :class="{active: settings.surfaceStyle === surface.value}" @click="updateSetting('surfaceStyle', surface.value)"><span class="settings-theme-icon"><app-icon :name="surface.value === 'classic' ? 'grid_view' : surface.value === 'glass-latest' ? 'auto_awesome' : 'tune'"></app-icon></span><strong>{{ surface.label }}</strong><small>{{ surface.hint }}</small></button>
          </div>
        </div>
        <div class="settings-field">
          <span class="settings-label">强调色</span>
          <div class="settings-accent-options" role="group" aria-label="选择强调色">
            <button v-for="accent in accentOptions" :key="accent.value" type="button" class="settings-accent-option" :class="{active: settings.accent === accent.value && !settings.customAccent}" :style="{'--settings-swatch': accent.color}" @click="updateSetting('accent', accent.value)"><i></i><span>{{ accent.label }}</span><app-icon v-if="settings.accent === accent.value && !settings.customAccent" name="check_circle"></app-icon></button>
            <label class="settings-custom-accent" :class="{active: !!settings.customAccent}" title="自定义主题色"><input type="color" :value="settings.customAccent || '#2f7d55'" @input="updateSetting('customAccent', $event.target.value)"><span>自定义</span><app-icon v-if="settings.customAccent" name="check_circle"></app-icon></label>
          </div>
        </div>
        <div class="settings-field settings-preview-field">
          <span class="settings-label">实时预览</span>
          <div class="settings-live-preview"><div class="settings-preview-rail"><span></span><span></span><span></span></div><div class="settings-preview-body"><div class="settings-preview-toolbar"><i></i><i></i><b></b></div><div class="settings-preview-cards"><div></div><div></div><div></div></div><div class="settings-preview-line"></div></div><div class="settings-preview-caption"><strong>{{ presetLabel }}</strong><span>当前主题会同步到所有角色工作台</span></div></div>
        </div>
        <div class="settings-two-col">
          <label>显示密度<select :value="settings.density" @change="updateSetting('density', $event.target.value)"><option value="comfortable">舒适</option><option value="compact">紧凑</option></select></label>
          <label>内容宽度<select :value="settings.layout" @change="updateSetting('layout', $event.target.value)"><option value="standard">标准</option><option value="wide">宽屏</option></select></label>
        </div>
        <div class="settings-field"><label>界面字体<select :value="settings.fontFamily" @change="updateSetting('fontFamily', $event.target.value)"><option v-for="item in fontOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select><small class="settings-field-hint">选择适合当前设备和阅读习惯的字体。</small></label></div>
        <label class="settings-switch"><input type="checkbox" :checked="settings.reducedMotion" @change="updateSetting('reducedMotion', $event.target.checked)"><span class="settings-switch-track"></span><span><strong>减少动效</strong><small>减少过渡和动画，适合低性能设备或对动效敏感时使用。</small></span></label>
      </article>

      <article class="g-card settings-card">
        <div class="settings-card-head"><div><span class="settings-card-kicker">数据体验</span><h2>刷新与提示</h2><p>控制工作台如何更新信息，以及是否保留来源标识。</p></div><app-icon name="sync"></app-icon></div>
        <label class="settings-switch"><input type="checkbox" :checked="settings.autoRefresh" @change="updateSetting('autoRefresh', $event.target.checked)"><span class="settings-switch-track"></span><span><strong>自动刷新工作台</strong><small>保持页面打开时拉取最新任务、遥测和建议。</small></span></label>
        <label class="settings-select-field">刷新间隔<select :value="settings.refreshInterval" :disabled="!settings.autoRefresh" @change="updateSetting('refreshInterval', Number($event.target.value))"><option v-for="seconds in refreshOptions" :key="seconds" :value="seconds">{{ seconds }} 秒</option></select></label>
        <label class="settings-switch"><input type="checkbox" :checked="settings.showDataOrigin" @change="updateSetting('showDataOrigin', $event.target.checked)"><span class="settings-switch-track"></span><span><strong>显示数据来源</strong><small>保留模拟、后端或人工记录标识，便于核对信息。</small></span></label>
        <div class="settings-info"><app-icon name="info"></app-icon><p>外观和工作台偏好只写入当前浏览器的本地存储，不会修改地块、设备或任务事实。</p></div>
      </article>
    </div>

    <footer class="settings-footer"><div><strong>当前设置</strong><span>{{ presetLabel }} · 主题：{{ themeLabel }} · 卡片：{{ surfaceStyleLabel }} · 强调色：{{ settings.customAccent || accentLabel }} · {{ fontLabel }}</span></div><button type="button" class="g-btn secondary" @click="resetSettings"><app-icon name="replay"></app-icon>恢复默认设置</button></footer>
  </section>
`;

export function createWorkspaceSettingsView({ ref, computed, watch }) {
  return {
    template: WORKSPACE_SETTINGS_TEMPLATE,
    props: ['state', 'userSettings'],
    emits: ['settings-changed'],
    setup(props, { emit }) {
      return createWorkspaceSettingsController({ props, emit, ref, computed, watch });
    }
  };
}

export { WORKSPACE_SETTINGS_TEMPLATE };
