export type NavigationItemStatus = 'active' | 'placeholder' | 'disabled';

export interface NavigationItem {
  readonly label: string;
  readonly href: string;
  readonly requiredPermissions?: readonly string[];
  readonly anyRequiredPermissions?: readonly string[];
  readonly status?: NavigationItemStatus;
}
