export type NavItem = {
  label: string;
  to: string;
  icon: string;
  group: "Overview" | "Create" | "Distribute" | "Grow" | "Account";
};

/** Single source of truth for the dashboard navigation. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: "LayoutDashboard", group: "Overview" },
  { label: "Create Video", to: "/create-video", icon: "Film", group: "Create" },
  { label: "Topic Ideas", to: "/ai-ideas", icon: "Lightbulb", group: "Create" },
  { label: "Topic Research", to: "/trend-research", icon: "TrendingUp", group: "Create" },
  { label: "Script Studio", to: "/script-studio", icon: "FileText", group: "Create" },
  { label: "Storyboard", to: "/storyboard", icon: "LayoutList", group: "Create" },
  { label: "Character Studio", to: "/character-studio", icon: "Users", group: "Create" },
  { label: "Voice Studio", to: "/voice-studio", icon: "Mic", group: "Create" },
  { label: "Video Studio", to: "/video-studio", icon: "Clapperboard", group: "Create" },
  { label: "Repurpose", to: "/repurpose", icon: "Scissors", group: "Create" },
  { label: "Content Calendar", to: "/calendar", icon: "CalendarDays", group: "Distribute" },
  { label: "Daily Queue", to: "/autopilot", icon: "CalendarClock", group: "Distribute" },
  { label: "Published", to: "/published", icon: "Send", group: "Distribute" },
  { label: "Analytics", to: "/analytics", icon: "BarChart3", group: "Grow" },
  { label: "Media Library", to: "/media-library", icon: "FolderOpen", group: "Grow" },
  { label: "Templates", to: "/templates", icon: "LayoutTemplate", group: "Grow" },
  { label: "Social Accounts", to: "/social-accounts", icon: "Share2", group: "Account" },
  { label: "Billing", to: "/billing", icon: "CreditCard", group: "Account" },
  { label: "Settings", to: "/settings", icon: "Settings", group: "Account" },
];

export const NAV_GROUPS = ["Overview", "Create", "Distribute", "Grow", "Account"] as const;
