import { google } from 'npm:googleapis@126.0.1';
import { JWT } from 'npm:google-auth-library@9.0.0';

const CALENDAR_ID = Deno.env.get('GOOGLE_CALENDAR_ID');
const SERVICE_ACCOUNT_JSON = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');

export async function syncToGoogleCalendar(
  action: 'create' | 'update' | 'delete',
  reservation: any,
  customer?: any,
  menuItem?: any,
  location?: any
): Promise<string | null> {
  if (!CALENDAR_ID) {
    console.log('[Google Calendar] GOOGLE_CALENDAR_ID missing, skipping sync');
    return null;
  }
  
  if (!SERVICE_ACCOUNT_JSON) {
    console.log('[Google Calendar] GOOGLE_SERVICE_ACCOUNT_JSON missing, skipping sync');
    return null;
  }

  try {
    const credentials = JSON.parse(SERVICE_ACCOUNT_JSON);
    const auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    if (action === 'delete') {
      if (!reservation.google_event_id) {
        return null;
      }
      try {
        await calendar.events.delete({
          calendarId: CALENDAR_ID,
          eventId: reservation.google_event_id,
        });
        console.log(`[Google Calendar] Deleted event ${reservation.google_event_id}`);
      } catch (err: any) {
        if (err.code === 404 || err.code === 410) {
          console.log('[Google Calendar] Event already deleted');
        } else {
          throw err;
        }
      }
      return null;
    }

    // Create or Update
    const customerName = customer 
      ? (customer.child_name || customer.parent_name || '顧客名なし') 
      : '顧客情報なし';
      
    const menuName = menuItem?.name || 'メニュー未定';
    const locationName = location?.location_name || 'Amaretto';
    
    const startTime = new Date(reservation.reservation_date_time);
    const endTime = new Date(startTime.getTime() + (reservation.duration_minutes || 60) * 60000);

    const event = {
      summary: `【予約】${customerName} 様 / ${menuName}`,
      location: locationName,
      description: `
予約番号: ${reservation.reservation_number || '-'}
メニュー: ${menuName}
顧客名: ${customerName} 様
担当スタッフ: ${reservation.staff_id_main || '未定'}
備考: ${reservation.notes_staff || 'なし'}
      `.trim(),
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'Asia/Tokyo',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'Asia/Tokyo',
      },
    };

    if (action === 'create' || (action === 'update' && !reservation.google_event_id)) {
      const res = await calendar.events.insert({
        calendarId: CALENDAR_ID,
        requestBody: event,
      });
      console.log(`[Google Calendar] Created event ${res.data.id}`);
      return res.data.id || null;
    } else if (action === 'update' && reservation.google_event_id) {
      try {
        const res = await calendar.events.update({
          calendarId: CALENDAR_ID,
          eventId: reservation.google_event_id,
          requestBody: event,
        });
        console.log(`[Google Calendar] Updated event ${reservation.google_event_id}`);
        return res.data.id || null;
      } catch (err: any) {
         if (err.code === 404 || err.code === 410) {
           // Event lost, create new
           console.log('[Google Calendar] Event not found for update, creating new');
           const res = await calendar.events.insert({
            calendarId: CALENDAR_ID,
            requestBody: event,
          });
          return res.data.id || null;
         }
         throw err;
      }
    }

    return null;
  } catch (error) {
    console.error('[Google Calendar] Error:', error);
    // Don't fail the request if calendar sync fails
    return null;
  }
}
