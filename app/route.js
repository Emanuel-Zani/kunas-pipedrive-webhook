import { NextResponse } from "next/server";

const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY;
const BASE_URL = "https://api.pipedrive.com/v1";
const processedReservations = new Set();

export async function GET() {
  console.log("Funcionando!");
  return NextResponse.json({ message: "El servidor está funcionando correctamente." });
}

// 🔍 Función mejorada para buscar una persona con paginación
async function buscarPersonaPorNombre(nombreBuscado) {
  let start = 0;
  const limit = 50; // Número de resultados por página

  try {
    console.log(`🔍 Buscando persona con nombre: "${nombreBuscado}" en Pipedrive...`);

    while (true) {
      const response = await fetch(`${BASE_URL}/persons?api_token=${PIPEDRIVE_API_KEY}&start=${start}&limit=${limit}`);
      const data = await response.json();
      const personas = data.data || [];

      for (const persona of personas) {
        if (persona.name.toLowerCase() === nombreBuscado.toLowerCase()) {
          console.log(`✅ Persona encontrada: ID ${persona.id}, Nombre: ${persona.name}`);
          return persona.id;
        }
      }

      // Si ya no hay más personas, detener la búsqueda
      if (personas.length < limit) break;

      // Pasar a la siguiente página
      start += limit;
    }

    console.log(`❌ La persona "${nombreBuscado}" no existe en Pipedrive.`);
    return null;
  } catch (error) {
    console.error("❌ Error al buscar personas en Pipedrive:", error);
    return null;
  }
}

// 🆕 Función para crear una persona en Pipedrive
async function crearPersonaEnPipedrive(nombreCompleto, email) {
  const personData = {
    name: nombreCompleto,
    email: email,
    visible_to: 3, 
  };

  try {
    const response = await fetch(`${BASE_URL}/persons?api_token=${PIPEDRIVE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(personData)
    });

    const data = await response.json();
    console.log(`✅ Persona creada exitosamente: ID ${data.data.id}`);
    return data.data.id;
  } catch (error) {
    console.error("❌ Error al crear la persona en Pipedrive:", error);
    return null;
  }
}

// 📌 Procesamiento del webhook
export async function POST(request) {
  try {
    const body = await request.json();
    const reservation = body;

    if (reservation.data_type === "avail") {
      console.log("🔍 Evento 'avail' detectado. Ignorando.");
      return NextResponse.json({ message: "Evento 'avail' ignorado." }, { status: 200 });
    }

    if (reservation.data_type === "reservation" && reservation.action === "insert") {
      const reservationId = reservation.data.id_reservations;

      if (processedReservations.has(reservationId)) {
        console.log(`✅ Reserva con ID ${reservationId} ya procesada. Ignorando.`);
        return NextResponse.json({ message: "Reserva ya procesada." }, { status: 200 });
      }

      console.log("📌 Nueva reserva detectada:", reservation);

      const nombreCompleto = `${reservation.data.first_name} ${reservation.data.last_name}`;
      const email = reservation.data.email || ""; 

      // 🔍 Buscar persona en Pipedrive antes de crear el Deal
      let personaId = await buscarPersonaPorNombre(nombreCompleto);

      if (!personaId) {
        // 🆕 Si no existe, crearla
        personaId = await crearPersonaEnPipedrive(nombreCompleto, email);
      }

      // 🏷️ Crear el Deal con el ID de la persona
      await addDeal(reservation.data, personaId);

      processedReservations.add(reservationId);
      return NextResponse.json({ message: "Webhook recibido y procesado." }, { status: 200 });
    }

    return NextResponse.json({ message: "No se procesó la reserva." }, { status: 200 });
  } catch (error) {
    console.error("❌ Error al procesar la reserva:", error);
    return NextResponse.json({ error: "Error al procesar la reserva." }, { status: 500 });
  }
}

// 🏷️ Función para crear un Deal en Pipedrive
async function addDeal(reservationDetails, personaId) {
  const dealData = {
    title: `Reserva de ${reservationDetails.first_name} ${reservationDetails.last_name} en ${reservationDetails.property_name}`,
    value: reservationDetails.total_price.toString(),
    ddc01baa72203eab75797469a79a1afc776dac68: reservationDetails.date_arrival,
    cd15dbfc3572ccb243664390a21010e3eb9e7c81: reservationDetails.date_departure,
    pipeline_id: 1,
    stage_id: 1,
  };

  if (personaId) {
    dealData.person_id = personaId;
  }

  try {
    const response = await fetch(`${BASE_URL}/deals?api_token=${PIPEDRIVE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dealData)
    });

    const data = await response.json();
    console.log("✅ Deal creado exitosamente:", data);
  } catch (error) {
    console.error("❌ Error al crear el deal:", error);
    throw new Error(error.message);
  }
}
