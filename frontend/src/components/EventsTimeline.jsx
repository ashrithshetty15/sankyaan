import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './EventsTimeline.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * EventsTimeline Component
 *
 * Displays corporate events and actions in a timeline format
 * Fetches real data from FMP API via backend
 *
 * Event types:
 * - dividend: Cash dividends
 * - split: Stock splits
 */

export default function EventsTimeline({ symbol }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchEvents = async () => {
      if (!symbol) return;

      try {
        setLoading(true);
        setError(null);
        console.log(`📅 Fetching corporate events for ${symbol}`);

        const response = await axios.get(`${API_URL}/stocks/${symbol}/events`);
        setEvents(response.data.events || []);

        console.log(`✅ Loaded ${response.data.events?.length || 0} events`);
      } catch (err) {
        console.error('❌ Failed to fetch corporate events:', err);
        setError(err.message);
        setEvents([]); // Set empty events on error
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [symbol]);
  // Group events by year
  const groupEventsByYear = (eventsList) => {
    const grouped = {};
    eventsList.forEach(event => {
      const year = new Date(event.date).getFullYear();
      if (!grouped[year]) grouped[year] = [];
      grouped[year].push(event);
    });

    // Sort events within each year by date (most recent first)
    Object.keys(grouped).forEach(year => {
      grouped[year].sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    return grouped;
  };

  // Get icon and color for event type
  const getEventIcon = (type) => {
    const icons = {
      dividend: '💰',
      split: '✂️',
    };
    return icons[type] || '📌';
  };

  const getEventColor = (type) => {
    const colors = {
      dividend: '#22c55e',
      split: '#3b82f6',
    };
    return colors[type] || 'var(--accent)';
  };

  // Don't render anything while loading or if there are no events
  if (loading) {
    return null; // Could show a loading state if desired
  }

  // If error or no events, don't render the component at all
  if (error || !events || events.length === 0) {
    return null;
  }

  const groupedEvents = groupEventsByYear(events);
  const years = Object.keys(groupedEvents).sort((a, b) => b - a); // Most recent year first

  return (
    <div className="events-timeline-container">
      <h3>Corporate Events & Timeline</h3>
      <p className="timeline-subtitle">Recent corporate actions and announcements</p>

      <div className="timeline">
        {years.map(year => (
          <div key={year} className="timeline-year">
            <div className="year-label">{year}</div>
            <div className="year-events">
              {groupedEvents[year].map((event, idx) => (
                <div key={idx} className="timeline-event">
                  <div className="event-marker">
                    <div
                      className="event-dot"
                      style={{ borderColor: getEventColor(event.type) }}
                    >
                      <div
                        className="event-dot-inner"
                        style={{ background: getEventColor(event.type) }}
                      ></div>
                    </div>
                    {idx < groupedEvents[year].length - 1 && (
                      <div className="event-line"></div>
                    )}
                  </div>
                  <div className="event-card">
                    <div className="event-icon">{getEventIcon(event.type)}</div>
                    <div className="event-details">
                      <div className="event-type">{event.description}</div>
                      <div
                        className="event-info"
                        style={{ color: getEventColor(event.type) }}
                      >
                        {event.type === 'dividend' && `$${event.amount?.toFixed(2) || 'N/A'}/share`}
                        {event.type === 'split' && `Ratio: ${event.ratio}`}
                      </div>
                      <div className="event-date">
                        {new Date(event.date).toLocaleDateString('en-IN', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
