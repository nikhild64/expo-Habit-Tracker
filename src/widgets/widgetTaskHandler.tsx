import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { loadHabits } from '@/lib/habits/storage';
import { isDoneToday } from '@/lib/habits/streak';

import { HabitlyTodayWidget, snapshotForWidget } from './HabitlyTodayWidget';

const nameToWidget = {
  HabitlyTodayWidget,
};

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const widgetInfo = props.widgetInfo;
  const Widget = nameToWidget[widgetInfo.widgetName as keyof typeof nameToWidget];
  if (!Widget) return;

  async function renderSnapshot() {
    try {
      const habits = await loadHabits();
      const snap = snapshotForWidget(habits, isDoneToday);
      props.renderWidget(React.createElement(Widget, snap));
    } catch (e) {
      // Render an error/empty state on read failure
      props.renderWidget(React.createElement(Widget, { date: '', habits: [] }));
      // eslint-disable-next-line no-console
      console.warn('[widgetTaskHandler] render failed', e);
    }
  }

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
    case 'WIDGET_CLICK':
      await renderSnapshot();
      break;
    case 'WIDGET_DELETED':
      // nothing to clean up — widget state is derived from app storage
      break;
    default:
      await renderSnapshot();
      break;
  }
}
