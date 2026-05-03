import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import IndexPage from '../index.vue';

// ── Mock $fetch ───────────────────────────────────────────────────────────────

const mockFetch = vi.hoisted(() => vi.fn());
mockNuxtImport('$fetch', () => mockFetch);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TEST_CONFIG = {
  event: { name: 'Test Event', subtitle: 'A test subtitle' },
  days: ['Day 1', 'Day 2'],
  participants: ['alice@test.com', 'bob@test.com', 'carol@example.com'],
  seminars: [
    { id: 's1', day: 'Day 1', time: '09:00–10:30', room: 'Room A', title: 'Seminar One' },
    { id: 's2', day: 'Day 1', time: '11:00–12:00', room: 'Room B', title: 'Seminar Two' },
    { id: 's3', day: 'Day 2', time: '09:00–10:00', room: 'Room A', title: 'Seminar Three' },
  ],
};

function setupConfigFetch(bookedIds: string[] = []) {
  mockFetch.mockImplementation(async (url: string) => {
    if (String(url).includes('/api/config')) return TEST_CONFIG;
    if (String(url).includes('/api/bookings/')) return bookedIds;
    return null;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Participant view (index.vue)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupConfigFetch();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ── Rendering ───────────────────────────────────────────────────────────────

  it('renders the event name from config', async () => {
    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();
    expect(wrapper.text()).toContain('Test Event');
  });

  it('renders the event subtitle from config', async () => {
    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();
    expect(wrapper.text()).toContain('A test subtitle');
  });

  it('shows the email input field', async () => {
    const wrapper = await mountSuspended(IndexPage);
    expect(wrapper.find('#email-input').exists()).toBe(true);
  });

  it('does not show day tabs before an email is selected', async () => {
    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();
    expect(wrapper.find('.day-tabs').exists()).toBe(false);
  });

  it('does not show the seminar grid before an email is selected', async () => {
    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();
    expect(wrapper.find('.seminars-grid').exists()).toBe(false);
  });

  // ── Email combobox ───────────────────────────────────────────────────────────

  it('shows all participants when the input is focused with empty value', async () => {
    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();

    const input = wrapper.find('#email-input');
    await input.trigger('focus');

    const items = wrapper.findAll('.combobox-item');
    expect(items).toHaveLength(3);
    expect(items[0].text()).toBe('alice@test.com');
    expect(items[1].text()).toBe('bob@test.com');
  });

  it('filters participants by the search term (case-insensitive)', async () => {
    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();

    const input = wrapper.find('#email-input');
    await input.trigger('focus');
    await input.setValue('alic');
    await input.trigger('input');

    const items = wrapper.findAll('.combobox-item');
    expect(items).toHaveLength(1);
    expect(items[0].text()).toBe('alice@test.com');
  });

  it('filters participants matching any part of the email', async () => {
    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();

    const input = wrapper.find('#email-input');
    await input.trigger('focus');
    await input.setValue('@test');
    await input.trigger('input');

    const items = wrapper.findAll('.combobox-item');
    expect(items).toHaveLength(2); // alice@test.com, bob@test.com
    expect(wrapper.text()).not.toContain('carol@example.com');
  });

  it('selects an email when a dropdown item is clicked', async () => {
    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();

    const input = wrapper.find('#email-input');
    await input.trigger('focus');

    const firstItem = wrapper.find('.combobox-item');
    await firstItem.trigger('mousedown');
    await flushPromises();

    expect((input.element as HTMLInputElement).value).toBe('alice@test.com');
    expect(wrapper.text()).toContain('alice@test.com');
  });

  it('fetches bookings for the selected email', async () => {
    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();

    const input = wrapper.find('#email-input');
    await input.trigger('focus');
    await wrapper.find('.combobox-item').trigger('mousedown');
    await flushPromises();

    const bookingsCalls = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes('/api/bookings/'),
    );
    expect(bookingsCalls.length).toBeGreaterThan(0);
    expect(String(bookingsCalls[0][0])).toContain('alice%40test.com');
  });

  // ── Day tabs ─────────────────────────────────────────────────────────────────

  it('shows day tabs after selecting an email', async () => {
    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();

    await wrapper.find('#email-input').trigger('focus');
    await wrapper.find('.combobox-item').trigger('mousedown');
    await flushPromises();

    const tabs = wrapper.findAll('.day-tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].text()).toBe('Day 1');
    expect(tabs[1].text()).toBe('Day 2');
  });

  it('activates the first day tab by default', async () => {
    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();

    await wrapper.find('#email-input').trigger('focus');
    await wrapper.find('.combobox-item').trigger('mousedown');
    await flushPromises();

    const activeTab = wrapper.find('.day-tab.active');
    expect(activeTab.text()).toBe('Day 1');
  });

  it('switches to a different day when its tab is clicked', async () => {
    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();

    await wrapper.find('#email-input').trigger('focus');
    await wrapper.find('.combobox-item').trigger('mousedown');
    await flushPromises();

    const tabs = wrapper.findAll('.day-tab');
    await tabs[1].trigger('click');

    expect(wrapper.find('.day-tab.active').text()).toBe('Day 2');
  });

  // ── Seminar grid ──────────────────────────────────────────────────────────────

  it('shows only the seminars for the selected day', async () => {
    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();

    await wrapper.find('#email-input').trigger('focus');
    await wrapper.find('.combobox-item').trigger('mousedown');
    await flushPromises();

    const cards = wrapper.findAll('.seminar-card');
    // Day 1 has s1 and s2
    expect(cards).toHaveLength(2);
    expect(wrapper.text()).toContain('Seminar One');
    expect(wrapper.text()).toContain('Seminar Two');
    expect(wrapper.text()).not.toContain('Seminar Three');
  });

  it('shows the seminar title, time, and room on each card', async () => {
    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();

    await wrapper.find('#email-input').trigger('focus');
    await wrapper.find('.combobox-item').trigger('mousedown');
    await flushPromises();

    const firstCard = wrapper.find('.seminar-card');
    expect(firstCard.text()).toContain('Seminar One');
    expect(firstCard.text()).toContain('09:00–10:30');
    expect(firstCard.text()).toContain('Room A');
  });

  it('marks seminars already booked with the is-booked class', async () => {
    setupConfigFetch(['s1']);

    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();

    await wrapper.find('#email-input').trigger('focus');
    await wrapper.find('.combobox-item').trigger('mousedown');
    await flushPromises();

    const cards = wrapper.findAll('.seminar-card');
    expect(cards[0].classes()).toContain('is-booked');
    expect(cards[1].classes()).not.toContain('is-booked');
  });

  // ── Toggle behaviour ──────────────────────────────────────────────────────────

  it('adds is-booked class when a seminar is toggled on', async () => {
    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();

    await wrapper.find('#email-input').trigger('focus');
    await wrapper.find('.combobox-item').trigger('mousedown');
    await flushPromises();

    const card = wrapper.findAll('.seminar-card')[0];
    expect(card.classes()).not.toContain('is-booked');

    await card.find('.toggle-btn').trigger('click');
    expect(card.classes()).toContain('is-booked');
  });

  it('removes is-booked class when a booked seminar is toggled off', async () => {
    setupConfigFetch(['s1']);

    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();

    await wrapper.find('#email-input').trigger('focus');
    await wrapper.find('.combobox-item').trigger('mousedown');
    await flushPromises();

    const card = wrapper.findAll('.seminar-card')[0];
    expect(card.classes()).toContain('is-booked');

    await card.find('.toggle-btn').trigger('click');
    expect(card.classes()).not.toContain('is-booked');
  });

  it('shows "Signed up" label on the toggle button when a seminar is booked', async () => {
    setupConfigFetch(['s1']);

    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();

    await wrapper.find('#email-input').trigger('focus');
    await wrapper.find('.combobox-item').trigger('mousedown');
    await flushPromises();

    const btn = wrapper.findAll('.toggle-btn')[0];
    expect(btn.text()).toContain('Signed up');
  });

  it('calls the bookings API after the debounce delay when a seminar is toggled', async () => {
    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();

    await wrapper.find('#email-input').trigger('focus');
    await wrapper.find('.combobox-item').trigger('mousedown');
    await flushPromises();

    mockFetch.mockResolvedValue({ ok: true });
    await wrapper.findAll('.toggle-btn')[0].trigger('click');

    // Before debounce fires, the POST should not have happened yet
    const postsBefore = mockFetch.mock.calls.filter(
      (c) => c[1]?.method === 'POST',
    );
    expect(postsBefore).toHaveLength(0);

    // Advance past the 400ms debounce
    vi.advanceTimersByTime(500);
    await flushPromises();

    const postsAfter = mockFetch.mock.calls.filter(
      (c) => c[1]?.method === 'POST',
    );
    expect(postsAfter).toHaveLength(1);
    expect(postsAfter[0][1].body).toContain('s1');
  });

  it('shows seminars for Day 2 when the Day 2 tab is selected', async () => {
    const wrapper = await mountSuspended(IndexPage);
    await flushPromises();

    await wrapper.find('#email-input').trigger('focus');
    await wrapper.find('.combobox-item').trigger('mousedown');
    await flushPromises();

    await wrapper.findAll('.day-tab')[1].trigger('click');

    expect(wrapper.text()).toContain('Seminar Three');
    expect(wrapper.text()).not.toContain('Seminar One');
    expect(wrapper.text()).not.toContain('Seminar Two');
  });
});
