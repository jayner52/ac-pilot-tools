import { useState, useRef, useCallback } from 'react';
import { parsePDF } from '../utils/pdfParser.js';
import styles from './UploadPage.module.css';

export default function UploadPage({ onScheduleLoad }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [debugText, setDebugText] = useState(null);
  const fileInputRef = useRef(null);

  const handleFile = useCallback(async (file) => {
    if (!file || file.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setDebugText(null);

    try {
      const schedule = await parsePDF(file);

      if (schedule.error) {
        setError(`Parse warning: ${schedule.error}`);
        setDebugText(schedule.rawText);
      }

      if (!schedule.bidPeriod) {
        setError('Could not detect bid period. Showing raw text for debugging.');
        setDebugText(schedule.rawText);
        setIsLoading(false);
        return;
      }

      onScheduleLoad(schedule);
    } catch (err) {
      console.error('PDF parse error:', err);
      setError(`Failed to parse PDF: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [onScheduleLoad]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, [handleFile]);

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);

  const onFileInput = (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.logoMark}>✈</div>
        <h1 className={styles.title}>Crew Tracker</h1>
        <p className={styles.subtitle}>
          Upload your Air Canada Block Report PDF to generate an interactive schedule calendar.
        </p>
      </div>

      <div
        className={`${styles.dropzone} ${isDragging ? styles.dragging : ''} ${isLoading ? styles.loading : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !isLoading && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && !isLoading && fileInputRef.current?.click()}
        aria-label="Upload PDF"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={onFileInput}
          className={styles.hiddenInput}
          tabIndex={-1}
        />

        {isLoading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Parsing your block report…</p>
          </div>
        ) : (
          <div className={styles.uploadPrompt}>
            <div className={styles.uploadIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p className={styles.dropText}>
              {isDragging ? 'Drop your PDF here' : 'Drag & drop your Block Report PDF'}
            </p>
            <p className={styles.orText}>or</p>
            <button className={styles.browseBtn} type="button" tabIndex={-1}>
              Browse Files
            </button>
            <p className={styles.hint}>Supports Air Canada Block Report format</p>
          </div>
        )}
      </div>

      {error && (
        <div className={styles.errorBox}>
          <span className={styles.errorIcon}>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {debugText && (
        <details className={styles.debugSection}>
          <summary className={styles.debugSummary}>
            Show extracted PDF text (for debugging)
          </summary>
          <pre className={styles.debugText}>{debugText}</pre>
        </details>
      )}

      <div className={styles.legend}>
        <h3 className={styles.legendTitle}>Calendar Color Key</h3>
        <div className={styles.legendItems}>
          <div className={styles.legendItem}>
            <span className={`${styles.dot} ${styles.dotOff}`} />
            <span>Day Off</span>
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.dot} ${styles.dotFlying}`} />
            <span>Flying Day</span>
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.dot} ${styles.dotLayover}`} />
            <span>Layover</span>
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.dot} ${styles.dotTraining}`} />
            <span>Training</span>
          </div>
        </div>
      </div>
    </div>
  );
}
