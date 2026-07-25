import {
  GalleryHorizontalEnd,
  LayoutDashboard,
  Settings,
  SquareKanban,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export interface SwipeNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const SWIPE_NAV_ITEMS: SwipeNavItem[] = [
  { label: "Swipe", href: "/swipe", icon: GalleryHorizontalEnd },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Applications", href: "/applications", icon: SquareKanban },
  { label: "Profile", href: "/profile", icon: UserRound },
  { label: "Settings", href: "/settings", icon: Settings },
];
