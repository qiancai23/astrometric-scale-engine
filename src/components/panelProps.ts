/** Props every panel accepts from the app shell. */
export interface PanelProps {
  /**
   * True when the panel is shown inside the phone/tablet bottom sheet instead of floating on
   * the desktop. Panels should tighten spacing and drop secondary detail when set.
   */
  compact?: boolean;
}
