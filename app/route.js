import { NextResponse } from "next/server";

const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY;
const BASE_URL = "https://api.pipedrive.com/v1";
const processedReservations = new Set();
const TOKEN_KUNAS = process.env.TOKEN_KUNAS;
const KEY_KUNAS = process.env.KEY_KUNAS;

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
      // Se itera sobre los resultados para encontrar una coincidencia exacta (ignorando mayúsculas/minúsculas)
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

async function extraerDatos(email) {
  const url = "https://app.otasync.me/api/guests/data/guests";
  const headers = { "Content-Type": "application/json" };
  const id_properties = 7542;
  let foundData = null;
  let daysOffset = 0;
  const maxDaysOffset = 30; // Hasta cuántos días atrás buscar

  while (!foundData && daysOffset <= maxDaysOffset) {
    let page = 1;
    const dfrom = new Date();
    dfrom.setDate(dfrom.getDate() - daysOffset);
    const dto = new Date(dfrom);
    dto.setDate(dto.getDate() + 1);
    const formattedDfrom = dfrom.toISOString().split('T')[0];
    const formattedDto = dto.toISOString().split('T')[0];

    // Bucle interno para paginar la búsqueda en el rango de fechas definido
    while (!foundData) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            token: TOKEN_KUNAS,
            key: KEY_KUNAS,
            id_properties,
            dfrom: formattedDfrom,
            dto: formattedDto,
            page
          })
        });
        if (!response.ok) {
          throw new Error(`Error en la solicitud: ${response.statusText}`);
        }
        const data = await response.json();
        if (!data || !data.guests || data.guests.length === 0) break;
        for (const guest of data.guests) {
          if (guest.email === email) {
            foundData = {
              phone: guest.phone,
              country: guest.country
            };
            break;
          }
        }
        page++;
      } catch (error) {
        console.error("Error al obtener datos:", error);
        break;
      }
    }
    daysOffset++;
  }
  return foundData;
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
      let paisYtelefono = await extraerDatos(email).then(console.log).catch(console.error);;
      
      const telefono = paisYtelefono.phone;
      const pais = paisYtelefono.country;

      if (!personaId) {
        personaId = await crearPersonaEnPipedrive(nombreCompleto, email);
      }
      await addDeal(reservation.data, personaId, niños, telefono, pais);
      processedReservations.add(reservationId);
      return NextResponse.json({ message: "Webhook recibido y procesado." }, { status: 200 });
    }
    return NextResponse.json({ message: "No se procesó la reserva." }, { status: 200 });
  } catch (error) {
    console.error("❌ Error al procesar la reserva:", error);
    return NextResponse.json({ error: "Error al procesar la reserva." }, { status: 500 });
  }
}

async function addDeal(reservationDetails, personaId, niños, telefono, pais) {
  const dealData = {
    title: `Reserva de ${reservationDetails.first_name} ${reservationDetails.last_name} en ${reservationDetails.property_name}`,
    value: reservationDetails.total_price.toString(),
    ddc01baa72203eab75797469a79a1afc776dac68: reservationDetails.date_arrival ?? "No especificado",
    cd15dbfc3572ccb243664390a21010e3eb9e7c81: reservationDetails.date_departure ?? "No especificado",
    ec929dafad8161a2191a9310e8a22c3f0e14dcea: reservationDetails.nights ?? "No especificado",
    aee0b941b3164ed351e8f73989bca903207a97f3: reservationDetails.adults ?? "No especificado",
    '5f41eab7a51a40acbf99a24d8dc36a7f5786cf86': niños ?? "No especificado",
    ac907fd34e67f90bab739453da5642cfc79dbf3a: telefono ?? "No especificado",
    '91643604b4916086cf51d676af68bcb53b7c4d44': pais ?? "No especificado",


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
