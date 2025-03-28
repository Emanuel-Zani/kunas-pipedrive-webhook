import { NextResponse } from "next/server";

const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY;
const BASE_URL = "https://api.pipedrive.com/v1";
const processedReservations = new Set();

export async function GET() {
  console.log("Funcionando!");
  return NextResponse.json({ message: "El servidor está funcionando correctamente." });
}

async function buscarPersonaPorNombre(nombreBuscado) {
  try {
    console.log(`🔍 Buscando persona con nombre: "${nombreBuscado}" en Pipedrive...`);
    const response = await fetch(
      `${BASE_URL}/persons/search?term=${encodeURIComponent(nombreBuscado)}&api_token=${PIPEDRIVE_API_KEY}`
    );
    const data = await response.json();
    if (data.data?.items?.length > 0) {
      for (const itemObj of data.data.items) {
        const persona = itemObj.item;
        if (persona.name.toLowerCase() === nombreBuscado.toLowerCase()) {
          const email = persona.emails?.find(e => e.primary)?.value || "No especificado";
          console.log(`✅ Persona encontrada: ID ${persona.id}, Nombre: ${persona.name}, Email: ${email}`);
          return persona.id;
        }
      }
    }
    console.log(`❌ La persona "${nombreBuscado}" no existe en Pipedrive.`);
    return null;
  } catch (error) {
    console.error("❌ Error al buscar personas en Pipedrive:", error);
    return null;
  }
}

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
    if (!response.ok) {
      throw new Error(`Error al crear persona: ${response.status}`);
    }
    const data = await response.json();
    console.log(`✅ Persona creada exitosamente: ID ${data.data.id}`);
    return data.data.id;
  } catch (error) {
    console.error("❌ Error al crear la persona en Pipedrive:", error);
    return null;
  }
}


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
      const niños = (reservation.data.children_1 ?? 0) + (reservation.data.children_2 ?? 0) +
                    (reservation.data.children_3 ?? 0) + (reservation.data.children_4 ?? 0) +
                    (reservation.data.children_5 ?? 0) + (reservation.data.children_6 ?? 0) +
                    (reservation.data.children_7 ?? 0);
      let personaId = await buscarPersonaPorNombre(nombreCompleto);

      if (!personaId) {
        personaId = await crearPersonaEnPipedrive(nombreCompleto, email);
      }
      await addDeal(reservation.data, personaId, niños);
      processedReservations.add(reservationId);
      return NextResponse.json({ message: "Webhook recibido y procesado." }, { status: 200 });
    }
    return NextResponse.json({ message: "No se procesó la reserva." }, { status: 200 });
  } catch (error) {
    console.error("❌ Error al procesar la reserva:", error);
    return NextResponse.json({ error: "Error al procesar la reserva." }, { status: 500 });
  }
}

async function addDeal(reservationDetails, personaId, niños,) {

  const dealData = {
    
    //Titulo de la tarjeta
    title: `Reserva de ${reservationDetails.first_name} ${reservationDetails.last_name} en ${reservationDetails.property_name}`,
    //Precio
    value: reservationDetails.total_price.toString(),
    '07536df1ea27b358d11a5bc03244c8ada11a2f91': reservationDetails.total_price.toString(),
    //Fecha de llegada
    ddc01baa72203eab75797469a79a1afc776dac68: reservationDetails.date_arrival ?? "No especificado",
    //Fecha de salida
    cd15dbfc3572ccb243664390a21010e3eb9e7c81: reservationDetails.date_departure ?? "No especificado",
    //Cantidad de noches
    ec929dafad8161a2191a9310e8a22c3f0e14dcea: reservationDetails.nights ?? "No especificado",
    //Cantidad de adultos
    aee0b941b3164ed351e8f73989bca903207a97f3: reservationDetails.adults ?? "No especificado",
    //Cantidad de niños
    '5f41eab7a51a40acbf99a24d8dc36a7f5786cf86': niños ?? "No especificado",
    //Teléfono
    phone: reservationDetails.phone ?? "No especificado",
    //País
    '6c93fbe9ffc994b56c640ebf803cf63a0a0d67a4': reservationDetails.country ?? "No especificado",

    pipeline_id: 1,
    stage_id: 1,
  };
  
  if (personaId) {
    dealData.person_id = personaId;
  } else {
    dealData.person_name = `${reservationDetails.first_name} ${reservationDetails.last_name}`;
  }

  try {
    const response = await fetch(`${BASE_URL}/deals?api_token=${PIPEDRIVE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
