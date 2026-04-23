'use client';

interface TraderAvatarProps {
  address: string;
  image?: string;
  className?: string;
}

export function TraderAvatar({ address, image, className = 'w-8 h-8' }: TraderAvatarProps) {
  const hue = address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
  const bgColor = `hsl(${hue}, 50%, 30%)`;

  if (image) {
    return (
      <img
        src={image}
        alt={address}
        className={`cyber-avatar shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`cyber-avatar flex shrink-0 items-center justify-center rounded-full text-xs font-bold ${className}`}
      style={{ backgroundColor: bgColor, color: '#fff' }}
    >
      {address.slice(0, 2).toUpperCase()}
    </div>
  );
}
