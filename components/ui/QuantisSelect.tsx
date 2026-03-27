"use client";

import { Check, ChevronDown } from "lucide-react";
import { type CSSProperties, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type QuantisSelectOption = {
  value: string;
  label: string;
  description?: string;
};

type QuantisSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: QuantisSelectOption[];
  placeholder: string;
  disabled?: boolean;
  buttonClassName?: string;
};

export function QuantisSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  buttonClassName
}: QuantisSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  const selectedOption = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function updateMenuPosition() {
      if (!triggerRef.current) {
        return;
      }

      const rect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const edgePadding = 8;
      const verticalGap = 6;
      const spaceBelow = viewportHeight - rect.bottom - edgePadding;
      const spaceAbove = rect.top - edgePadding;
      const openUpwards = spaceBelow < 210 && spaceAbove > spaceBelow;

      const maxHeight = Math.max(160, Math.min(300, openUpwards ? spaceAbove - verticalGap : spaceBelow - verticalGap));
      const width = Math.min(rect.width, viewportWidth - edgePadding * 2);
      const left = Math.min(Math.max(edgePadding, rect.left), viewportWidth - width - edgePadding);

      setMenuStyle({
        position: "fixed",
        left,
        top: openUpwards ? rect.top - verticalGap : rect.bottom + verticalGap,
        width,
        maxHeight,
        zIndex: 240,
        transform: openUpwards ? "translateY(-100%)" : undefined
      });
    }

    function onClickOutside(event: MouseEvent) {
      const targetNode = event.target as Node;
      if (!rootRef.current) {
        return;
      }
      const clickedTrigger = rootRef.current.contains(targetNode);
      const clickedMenu = menuRef.current?.contains(targetNode) ?? false;
      if (!clickedTrigger && !clickedMenu) {
        setIsOpen(false);
      }
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    updateMenuPosition();
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => setIsOpen((current) => !current)}
        className={`quantis-select-trigger ${buttonClassName ?? ""}`}
      >
        <span className={selectedOption ? "text-sm text-white" : "text-sm text-white/55"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-white/65 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              id={listboxId}
              role="listbox"
              style={menuStyle}
              className="quantis-select-menu"
              aria-label={placeholder}
            >
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`quantis-select-option ${isSelected ? "is-selected" : ""}`}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                  >
                    <span className="truncate text-left">
                      <span className="block text-sm">{option.label}</span>
                      {option.description ? (
                        <span className="mt-0.5 block text-xs text-white/55">{option.description}</span>
                      ) : null}
                    </span>
                    {isSelected ? <Check className="h-4 w-4 shrink-0 text-quantis-gold" /> : null}
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
