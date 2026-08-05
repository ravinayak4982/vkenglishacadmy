import mongoose from "mongoose";

export default async function connectDatabase() {
  mongoose.set("strictQuery", true);

  await mongoose.connect(
    "mongodb+srv://ravinayak4982:Indore%40123@cluster0.dh51y.mongodb.net/AcadmyDb?retryWrites=true&w=majority&appName=Cluster0"
  );

  console.log("MongoDB connected");
}