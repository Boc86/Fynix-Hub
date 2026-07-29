import React from 'react';
import styles from './IPTVServerModal.module.css';

export type ServerOption = { label: string; url: string };

export const DEFAULT_SERVERS: ServerOption[] = [
  { label: 'CDNLive', url: 'http://example.com/cdnlive.m3u' },
  { label: 'OnDemand', url: 'http://example.com/ondemand.m3u' },
  { label: 'DLHD', url: 'http://example.com/dlhd.m3u' },
  { label: 'IPTV M3U', url: 'http://magnetic.website/MAD_TITAN_SPORTS/Keep_m3u_json/zone1.txt' },
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onServerSelect: (server: ServerOption) => void;
};

export default function IPTVServerModal({ isOpen, onClose, onServerSelect }: Props) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: '#222',
          color: '#fff',
          padding: 24,
          borderRadius: 8,
          minWidth: 300,
          maxWidth: '90%',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Choose an M3U source</h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {DEFAULT_SERVERS.map((s) => (
            <li key={s.url} style={{ marginBottom: 12 }}>
              <button
                className={styles.serverButton}
                onClick={() => {
                  onServerSelect(s);
                  onClose();
                }}
                style={{
                  width: '100%',
                  padding: 10,
                  background: '#444',
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  textAlign: 'left',
                }}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
        <button
          onClick={onClose}
          style={{
            marginTop: 12,
            background: '#555',
            border: 'none',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}