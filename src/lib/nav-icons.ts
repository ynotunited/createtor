import {
  BarChart3,
  CalendarClock,
  CalendarDays,
  Clapperboard,
  CreditCard,
  FileText,
  Film,
  FolderOpen,
  LayoutDashboard,
  LayoutList,
  LayoutTemplate,
  Lightbulb,
  Mic,
  Scissors,
  Send,
  Settings,
  Share2,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { NavItem } from "@/lib/nav";

/**
 * Static map of the icons referenced by `NAV_ITEMS`.
 *
 * A namespace import (`import * as Icons from "lucide-react"`) defeats
 * tree-shaking and ships the entire icon library to the client bundle. Listing
 * each icon explicitly keeps only the ones we actually render.
 */
export const NAV_ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Film,
  Lightbulb,
  TrendingUp,
  FileText,
  LayoutList,
  Users,
  Mic,
  Clapperboard,
  Scissors,
  CalendarDays,
  CalendarClock,
  Send,
  BarChart3,
  FolderOpen,
  LayoutTemplate,
  Share2,
  CreditCard,
  Settings,
};

export function navIcon(name: NavItem["icon"]): LucideIcon | undefined {
  return NAV_ICONS[name];
}
