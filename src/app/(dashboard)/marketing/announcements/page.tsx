'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/fetch';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { LoadingState } from '@/components/shared/loading-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  content: string;
  target_audience: string;
  start_date: string;
  end_date: string;
  priority: string;
  created_at: string;
}

const emptyForm = {
  title: '',
  content: '',
  target_audience: 'all_users',
  start_date: '',
  end_date: '',
  priority: 'medium',
};

function displayDate(value: string) {
  return new Date(value).toLocaleString();
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/announcements');
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || 'Announcements could not be loaded.');
      }
      setAnnouncements(Array.isArray(result.data) ? result.data : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Announcements could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnnouncements();
  }, [loadAnnouncements]);

  async function createAnnouncement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError('');

    try {
      const response = await apiFetch('/api/announcements', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          start_date: new Date(form.start_date).toISOString(),
          end_date: new Date(form.end_date).toISOString(),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || 'Announcement could not be created.');
      }

      setForm(emptyForm);
      setShowForm(false);
      if (result.warning) setFormError(result.warning);
      await loadAnnouncements();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Announcement could not be created.');
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={loadAnnouncements} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Announcements</h1>
          <p className="text-muted-foreground">Schedule messages for traders and affiliates</p>
        </div>
        <Button className="gap-2" onClick={() => setShowForm((visible) => !visible)}>
          <Plus className="h-4 w-4" />
          {showForm ? 'Cancel' : 'Create Announcement'}
        </Button>
      </div>

      {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}

      {showForm && (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={createAnnouncement} className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Announcement title"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                required
                maxLength={150}
              />
              <select
                value={form.target_audience}
                onChange={(event) => setForm((current) => ({ ...current, target_audience: event.target.value }))}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="all_users">All users</option>
                <option value="active_traders">Active traders</option>
                <option value="funded_traders">Funded traders</option>
                <option value="affiliates">Affiliates</option>
              </select>
              <textarea
                placeholder="Announcement content"
                value={form.content}
                onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                required
                maxLength={5000}
                className="min-h-28 rounded-md border bg-background px-3 py-2 text-sm md:col-span-2"
              />
              <Input
                type="datetime-local"
                aria-label="Start date"
                value={form.start_date}
                onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))}
                required
              />
              <Input
                type="datetime-local"
                aria-label="End date"
                value={form.end_date}
                onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))}
                required
              />
              <select
                value={form.priority}
                onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="low">Low priority</option>
                <option value="medium">Medium priority</option>
                <option value="high">High priority</option>
                <option value="critical">Critical priority</option>
              </select>
              <div className="flex justify-end md:col-span-2">
                <Button type="submit" disabled={saving || !form.title.trim() || !form.content.trim()}>
                  {saving ? 'Creating…' : 'Schedule Announcement'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? <LoadingState rows={4} /> : announcements.length === 0 ? (
        <EmptyState message="No announcements are scheduled." />
      ) : (
        <div className="space-y-3">
          {announcements.map((announcement) => (
            <Card key={announcement.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">{announcement.title}</h2>
                  <span className="text-xs capitalize text-muted-foreground">
                    {announcement.priority} · {announcement.target_audience.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{announcement.content}</p>
                <p className="text-xs text-muted-foreground">
                  {displayDate(announcement.start_date)} – {displayDate(announcement.end_date)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
