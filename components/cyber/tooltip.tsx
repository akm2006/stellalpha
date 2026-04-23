'use client';

import { MouseEvent, ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

interface TooltipProps {
  children: ReactNode;
  trigger: ReactNode;
  triggerClassName?: string;
  ariaLabel?: string;
  label?: string;
  onTriggerClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

export function Tooltip({
  children,
  trigger,
  triggerClassName,
  ariaLabel = 'More information',
  label = 'Info',
  onTriggerClick,
}: TooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({
    top: 0,
    left: 0,
    placement: 'bottom' as 'top' | 'bottom',
  });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const updateTooltipPosition = () => {
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const viewportPadding = 8;
    const tooltipWidth = Math.min(320, window.innerWidth - viewportPadding * 2);
    const tooltipHeightEstimate = 240;
    let left = rect.left + rect.width / 2;

    const minLeft = tooltipWidth / 2 + viewportPadding;
    const maxLeft = window.innerWidth - tooltipWidth / 2 - viewportPadding;
    left = Math.max(minLeft, Math.min(maxLeft, left));

    const belowTop = rect.bottom + 10;
    const aboveTop = rect.top - 10;
    const hasRoomBelow = belowTop + tooltipHeightEstimate <= window.innerHeight - viewportPadding;
    const hasRoomAbove = aboveTop - tooltipHeightEstimate >= viewportPadding;
    const placement = !hasRoomBelow && hasRoomAbove ? 'top' : 'bottom';
    const top = placement === 'top'
      ? aboveTop
      : Math.max(
          viewportPadding,
          Math.min(belowTop, window.innerHeight - tooltipHeightEstimate - viewportPadding),
        );

    setTooltipPosition({ top, left, placement });
  };

  const handleShow = () => {
    clearCloseTimeout();
    updateTooltipPosition();
    setShowTooltip(true);
  };

  const handleHide = () => {
    clearCloseTimeout();
    setShowTooltip(false);
  };

  const scheduleHide = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false);
      closeTimeoutRef.current = null;
    }, 120);
  };

  useEffect(() => () => clearCloseTimeout(), []);

  useEffect(() => {
    if (!showTooltip) return;

    updateTooltipPosition();
    const handleScroll = () => updateTooltipPosition();
    const handleResize = () => updateTooltipPosition();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleHide();
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showTooltip]);

  return (
    <>
      <div className="relative inline-flex items-center">
        <button
          ref={buttonRef}
          type="button"
          aria-describedby={showTooltip ? tooltipId : undefined}
          aria-label={ariaLabel}
          className={triggerClassName}
          onMouseEnter={handleShow}
          onMouseLeave={scheduleHide}
          onFocus={handleShow}
          onBlur={scheduleHide}
          onClick={(event) => {
            event.stopPropagation();
            onTriggerClick?.(event);
          }}
        >
          {trigger}
        </button>
      </div>
      {showTooltip && typeof window !== 'undefined' && createPortal(
        <div
          id={tooltipId}
          role="tooltip"
          data-label={label}
          data-placement={tooltipPosition.placement}
          className="cyber-tooltip fixed w-[min(20rem,calc(100vw-1rem))] max-h-[min(18rem,calc(100vh-1rem))] overflow-y-auto border p-3 shadow-lg pointer-events-auto"
          style={{
            backgroundColor: '#050505',
            borderColor: 'rgba(0,255,133,0.42)',
            boxShadow: '0 18px 44px rgba(0,0,0,0.72)',
            zIndex: 99999,
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            transform: tooltipPosition.placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
          }}
          onMouseEnter={handleShow}
          onMouseLeave={scheduleHide}
        >
          <div className="text-xs leading-relaxed text-white/90">{children}</div>
        </div>,
        document.body,
      )}
    </>
  );
}

export function InfoTooltip({ children }: { children: ReactNode }) {
  return (
    <Tooltip
      trigger={<Info size={12} />}
      triggerClassName="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-slate-400 transition-colors hover:bg-white/5 hover:text-[#00FF85] focus-visible:ring-1 focus-visible:ring-[#00FF85]/60"
      ariaLabel="More information"
      label="Info"
    >
      {children}
    </Tooltip>
  );
}
