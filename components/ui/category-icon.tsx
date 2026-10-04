import {
  Bus,
  Car,
  Gift,
  GraduationCap,
  Heart,
  House,
  PawPrint,
  Pill,
  Repeat,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Star,
  Tag,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { CategoryIcon as CategoryIconName } from "@/core/domain/budget/budget-category.entity";

const ICONS: Record<CategoryIconName, LucideIcon> = {
  tag: Tag,
  "shopping-cart": ShoppingCart,
  utensils: Utensils,
  car: Car,
  bus: Bus,
  pill: Pill,
  house: House,
  wrench: Wrench,
  "paw-print": PawPrint,
  heart: Heart,
  star: Star,
  "shopping-bag": ShoppingBag,
  repeat: Repeat,
  gift: Gift,
  shirt: Shirt,
  "graduation-cap": GraduationCap,
};

export function CategoryIcon({ name, className }: { name: CategoryIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden />;
}
