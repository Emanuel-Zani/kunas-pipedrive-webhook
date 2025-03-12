import { NextResponse } from "next/server";

const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY;

const processedReservations = new Set();

export async function GET() {
  console.log("Funcionando!");
  return NextResponse.json({ message: "El servidor está funcionando correctamente." });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const reservation = body;

    // Ignorar si el data_type es "avail"
    if (reservation.data_type === "avail") {
      console.log("🔍 Evento 'avail' detectado. Ignorando.");
      return NextResponse.json({ message: "Evento 'avail' ignorado." }, { status: 200 });
    }

    // Verificar si es una reserva nueva
    if (reservation.data_type === "reservation" && reservation.action === "insert") {
      const reservationId = reservation.data.id_reservations;

      // Verificar si la reserva ya ha sido procesada
      if (processedReservations.has(reservationId)) {
        console.log(`✅ Reserva con ID ${reservationId} ya procesada. Ignorando.`);
        return NextResponse.json({ message: "Reserva ya procesada." }, { status: 200 });
      }

      console.log("📌 Nueva reserva detectada:", reservation);
      await addDeal(reservation.data);
      processedReservations.add(reservationId); // Marca la reserva como procesada
      return NextResponse.json({ message: "Webhook recibido y procesado." }, { status: 200 });
    }

    return NextResponse.json({ message: "No se procesó la reserva." }, { status: 200 });
  } catch (error) {
    console.error("❌ Error al procesar la reserva:", error);
    return NextResponse.json({ error: "Error al procesar la reserva." }, { status: 500 });
  }
}

// Función para crear un deal en Pipedrive
async function addDeal(reservationDetails) {
  const dealData = {
    title: `Reserva de ${reservationDetails.first_name} ${reservationDetails.last_name} en ${reservationDetails.property_name}`,
    value: reservationDetails.total_price.toString(),
    ddc01baa72203eab75797469a79a1afc776dac68: reservationDetails.date_arrival,
    cd15dbfc3572ccb243664390a21010e3eb9e7c81: reservationDetails.date_departure,
    pipeline_id: 1,
    stage_id: 1,
  };

  try {
    const response = await fetch(`https://api.pipedrive.com/v1/deals?api_token=${PIPEDRIVE_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dealData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    console.log("✅ Deal creado exitosamente:", data);
  } catch (error) {
    console.error("❌ Error al crear el deal:", error.message);
    throw new Error(error.message);
  }
}
