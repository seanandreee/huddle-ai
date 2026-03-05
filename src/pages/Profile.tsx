import UserProfile from "@/components/UserProfile";

const Profile = () => {
  return (
    <div className="container mx-auto py-12 px-4">
      <h1 className="text-2xl font-semibold text-center mb-8">Your Profile</h1>
      <UserProfile />
    </div>
  );
};

export default Profile; 